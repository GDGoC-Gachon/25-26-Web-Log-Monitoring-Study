# Monitoring Job Structure

현재 `src/app.ts` 기준의 폴링, 탐지 Job, 메일 발송 흐름이다.

## Component Flow

```mermaid
flowchart TD
    ENV[".env / process.env"] --> CONFIG["src/config.ts"]
    CONFIG --> POLL_MS["jobsPollingMs"]

    APP["src/app.ts"] --> IMMEDIATE["void runPollingCycle()\n(startup immediate)"]
    POLL_MS --> TIMER["setInterval(runPollingCycle)"]
    TIMER --> CYCLE["runPollingCycle()"]
    IMMEDIATE --> CYCLE

    CYCLE --> GUARD{"pollingInProgress?"}
    GUARD -->|yes| OVERLAP["monitoring_poll_skipped"]
    GUARD -->|no| START["set pollingInProgress = true\nmonitoring_poll_started"]

    START --> DDoS["DDosJob()\nIP request count + domain counts"]
    DDoS -->|success| BRUTE["bruteForceJob()\nIP + domain auth failures"]
    DDoS -->|failure| JOB_FAIL1["monitoring_job_failed\ncontinue"]
    JOB_FAIL1 --> BRUTE

    BRUTE -->|success| SERVER["serverErrorJob()\n5xx rate by API domain"]
    BRUTE -->|failure| JOB_FAIL2["monitoring_job_failed\ncontinue"]
    JOB_FAIL2 --> SERVER

    SERVER --> SERVER_ALERT["domainErrorFindingsToAlerts(SERVER_ERROR)"]
    SERVER_ALERT --> SENSITIVE["sensitivePathJob()\npath match + count"]
    SERVER -->|failure| JOB_FAIL3["monitoring_job_failed\ncontinue"]
    JOB_FAIL3 --> SENSITIVE

    SENSITIVE -->|success| WEB["webErrorJob()\n4xx rate by host domain"]
    SENSITIVE -->|failure| JOB_FAIL4["monitoring_job_failed\ncontinue"]
    JOB_FAIL4 --> WEB

    WEB --> WEB_ALERT["domainErrorFindingsToAlerts(WEB_ERROR)"]
    WEB_ALERT --> ALERTS["alerts[]\nDetectionAlert[] accumulator"]
    WEB -->|failure| JOB_FAIL5["monitoring_job_failed\ncontinue to mail"]
    JOB_FAIL5 --> ALERTS

    subgraph ELASTIC["Each detection Job uses the shared Elastic path"]
        QUERY["build...EsqlQuery()"] --> REQUEST["buildEsqlQueryRequest()"]
        REQUEST --> ES["elasticClient.transport.request()"]
        ES --> PARSE["normalize / parse ES|QL response"]
        PARSE --> DETECT["threshold, rate, grouping, exclusions"]
    end

    DDoS -. uses .-> QUERY
    BRUTE -. uses .-> QUERY
    SERVER -. uses .-> QUERY
    SENSITIVE -. uses .-> QUERY
    WEB -. uses .-> QUERY

    ALERTS --> MAIL["mailNotification({ alerts })"]
    MAIL --> NO_ALERTS{"alerts.length === 0?"}
    NO_ALERTS -->|yes| NO_SEND["mail_notification_skipped\nno SMTP connection"]
    NO_ALERTS -->|no| SMTP_CONFIG{"SMTP host, sender, recipients?"}
    SMTP_CONFIG -->|no| CONFIG_SKIP["mail_notification_skipped\nwarn and return"]
    SMTP_CONFIG -->|yes| PER_ALERT["for each alert"]

    PER_ALERT --> RECIPIENTS["resolveDetectionRecipients()"]
    RECIPIENTS --> TEMPLATE["buildTemplatedDetectionAlertEmail()"]
    TEMPLATE --> SMTP["sendSmtpMessage()"]
    SMTP -->|success| SENT["mail_notification_sent"]
    SMTP -->|failure| MAIL_FAIL["mail_notification_failed\ncontinue next alert"]

    NO_SEND --> COMPLETE["mail_notification_completed\nmonitoring_poll_completed"]
    CONFIG_SKIP --> COMPLETE
    SENT --> COMPLETE
    MAIL_FAIL --> COMPLETE
    COMPLETE --> END["pollingInProgress = false"]

    classDef job fill:#e8f1ff,stroke:#3b6ea8,color:#102a43;
    classDef mail fill:#fff3e0,stroke:#c77700,color:#4a2a00;
    classDef error fill:#ffe8e8,stroke:#b42318,color:#5f1111;
    class DDoS,BRUTE,SERVER,SENSITIVE,WEB job;
    class MAIL,RECIPIENTS,TEMPLATE,SMTP,SENT mail;
    class JOB_FAIL1,JOB_FAIL2,JOB_FAIL3,JOB_FAIL4,JOB_FAIL5,CONFIG_SKIP,MAIL_FAIL error;
```

## SMTP Sequence

```mermaid
sequenceDiagram
    autonumber
    participant App as app.ts
    participant Job as Detection Job
    participant ES as Elasticsearch
    participant Mail as mailNotification
    participant Server as SMTP server

    App->>App: runPollingCycle()

    loop sequential pollingJobs order
        App->>Job: run detection Job
        Job->>ES: POST /_query with ES|QL
        ES-->>Job: columns + values
        alt Job succeeds
            Job-->>App: DetectionAlert[] or DomainErrorJobResult
        else Job fails
            Job-->>App: monitoring_job_failed
            Note over App: continue with next Job
        end
    end

    App->>Mail: mailNotification(alerts)
    alt no alerts
        Mail-->>App: mail_notification_skipped
    else SMTP configuration incomplete
        Mail-->>App: mail_notification_skipped
    else alerts available
        loop each alert
            Mail->>Mail: resolve recipients
            Mail->>Mail: render HTML + plain-text fallback
            Mail->>Server: connect + EHLO
            opt STARTTLS advertised and secure=false
                Mail->>Server: STARTTLS
                Server-->>Mail: 220 ready
                Mail->>Server: TLS upgrade + EHLO
            end
            opt credentials configured
                alt AUTH PLAIN advertised
                    Mail->>Server: AUTH PLAIN
                else AUTH LOGIN advertised
                    Mail->>Server: AUTH LOGIN + username + password
                end
                Server-->>Mail: 235 authenticated
            end
            Mail->>Server: MAIL FROM / RCPT TO / DATA
            Server-->>Mail: 250 accepted
            Mail->>Server: QUIT
            Mail-->>App: mail_notification_sent
        end
    end

    App-->>App: mail_notification_completed
    App-->>App: monitoring_poll_completed
```

## Execution Order

```text
startup or interval
  -> DDosJob
  -> bruteForceJob
  -> serverErrorJob
  -> sensitivePathJob
  -> webErrorJob
  -> alerts aggregation
  -> mailNotification
  -> next interval
```

개별 Job 실패는 `monitoring_job_failed`로 기록하고 다음 Job을 계속 실행한다. 메일 발송 실패도 다음 alert 처리를 막지 않는다.
