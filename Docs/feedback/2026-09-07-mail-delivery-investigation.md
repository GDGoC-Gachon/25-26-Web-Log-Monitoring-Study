# 메일 미수신 문의 조사 기록

## 검증 결과

| 케이스 | 상태 | 실제 관찰 | 증거 범위 |
|------|------|------|------|
| 기존 자동 테스트 | PASS | `npm test`: 42건 통과 | SMTP 발신 함수는 대체 함수로 검증하며 실제 통신은 검증하지 않음 |
| 타입 검사 | PASS | `npm run check`: 종료 코드 0 | 정적 타입 검사 |
| 민감 경로 알림의 실제 SMTP 함수 호출 | PASS | 로컬 TCP SMTP 연결 1회, HTML DATA 1건 수락, `sent=true` | 무인증·비TLS 모의 SMTP 수락까지, 외부 메일함 수신 아님 |
| 알림 0건 | PASS | SMTP 연결 0회, 메일 0건, `mail_notification_skipped` 기록 | 발신 생략 요구사항과 무알림 관측 로그 확인 |
| 알림 0건 + SMTP host 누락 | PASS | SMTP 연결 0회, 폴링 시작·완료 및 무알림 이벤트 기록 | 설정 누락은 알림이 있을 때 별도 경고로 표시 |
| 알림 1건 + SMTP host 누락 | PASS | SMTP 연결 0회, `mail_notification_skipped` 1건 | 경고 후 발신 생략 |
| LOGIN만 제공하는 SMTP | PASS | 연결 1회, LOGIN 인증 후 메일 1건, `sent=true` | 서버가 광고한 LOGIN 인증 방식을 선택하도록 수정 후 재검증 |
| 실제 앱 실행 + Elastic 결과 0건 | PASS | 조회 5회, SMTP 연결 0회, `monitoring_poll_started`·`mail_notification_skipped`·`monitoring_poll_completed` 기록 | 조회·탐지·메일 흐름의 로컬 모의 서버 검증 |
| 실제 앱 실행 + 민감 경로 1건 | PASS | 조회 5회, `sensitive_path_detected`, SMTP 연결 1회, 메일 1건 | 실제 `src/app.ts` 자식 프로세스와 로컬 HTTP/TCP 서버 |
| 첫 Job 탐지 후 세 번째 Job 조회 실패 | PASS | `ddos_detected`·`monitoring_job_failed` 기록 후 나머지 Job과 SMTP 발송 계속, 프로세스 생존 | HTTP 400 주입. 실패 Job 격리 로직을 로컬에서 재검증 |
| 5xx 조회 필터 문법 | PASS | `%`를 `*`로 교체하고 쿼리 회귀 기대값 갱신 | 실제 Elasticsearch 엔진 실행은 미수행 |
| QA 서버의 원인 확정 | BLOCKED | 적용 커밋, 실행 환경, 탐지 시나리오, 서버 로그 미확보 | 운영 서버·실제 SMTP에 접속하거나 메일을 발송하지 않음 |

`FAIL`은 표에 적힌 관측성·호환성·장애 격리 기준에 대한 결과다. 이 결과만으로 문의한 QA 서버가 같은 조건이라고 단정하지 않는다.

## 대상과 결론

- 조사일: 2026-09-07.
- 로컬 기준 커밋: `main`, `b3ee22cac397246083c719a18ea48f60d467aa26`; 조사 수정은 현재 작업 트리에 남아 있다.
- 최신 병합 PR: [#8: templated detection emails](https://github.com/GDGoC-Gachon/25-26-Web-Log-Monitoring-Study/pull/8), 2026-09-02 병합.
- PR은 템플릿 렌더링, 탐지별 메일, MIME 본문, DDoS 수신자 선택을 변경했다. 폴링과 SMTP 연결·인증 흐름은 이 PR에서 변경하지 않았다.
- **최신 PR 때문에 모든 메일 발신이 끊겼다는 현상은 로컬에서 재현되지 않았다. 탐지 0건일 때 로그와 SMTP 접속이 모두 없던 문제는 재현 후 관측 로그를 추가했다.**
- 조사 과정에서 확인한 문제 중 ES|QL 5xx 필터, 무로그 경로, Job 실패 전파, SMTP LOGIN 호환성을 수정했다. QA 서버의 실제 장애 원인은 서버 증거가 확보되기 전까지 별도로 취급한다.

## 확인한 코드 문제

### 1. 5xx 조회 필터가 일반 API 경로와 일치하지 않음 (수정 완료)

기존 `src/jobs/server-error.job/job.ts:22`는 다음 조건을 사용했다.

```text
WHERE path LIKE "/api/v1/%" OR path LIKE "/api/%"
```

Elasticsearch SQL과 달리 ES\|QL의 `LIKE` 와일드카드는 `*`, `?`다. 따라서 일반적인 `/api/v1/orders/list`는 기존 필터에 맞지 않아 5xx 탐지와 후속 메일이 누락될 수 있었다. [Elastic ES\|QL WHERE 공식 문서](https://www.elastic.co/docs/reference/query-languages/esql/commands/where#like-and-rlike)

`git blame`에서 해당 줄은 `ebce5c68`에 도입된 것으로 확인했다. PR #8 이전부터 존재한 문제다. `tests/monitoring.test.ts`도 `%`가 들어간 쿼리를 기대하고 조회 결과를 직접 주입하므로 이 문제를 잡지 못한다.

`%`를 `*`로 바꾸고 `tests/monitoring.test.ts`의 쿼리 기대값을 갱신했다. 실제 엔진에서 아래 상수 쿼리로 문법을 대조하면 운영 로그를 읽거나 수정하지 않고도 추가 검증할 수 있다. 아래 명령은 이번 조사에서 실행하지 않았다.

```text
POST /_query
{
  "query": "ROW path = \"/api/v1/orders/list\" | EVAL percent_match = path LIKE \"/api/v1/%\", star_match = path LIKE \"/api/v1/*\" | KEEP percent_match, star_match"
}
```

공식 문법에 따른 기대 결과는 `percent_match=false`, `star_match=true`다. 이 문제는 5xx에 해당하며 다른 탐지 유형의 미발신까지 설명하지는 않는다.

### 2. 탐지 전후 상태와 메일 성공 로그가 없음 (수정 완료)

- `src/app.ts:45`: 폴링 시작·Job 실패·메일 완료·폴링 완료 이벤트를 기록하고 첫 폴링을 즉시 시작한다.
- `src/jobs/mail-notification.job/job.ts:104`: 알림 배열이 비어도 `mail_notification_skipped`를 기록한다.
- 같은 파일의 `:180`: SMTP 발신 성공 시 `mail_notification_sent`를 기록한다.

이제 정상 로그 설정에서는 폴링과 메일 결과를 구분할 수 있다. 단, 로그 수집기에서 stdout을 버리거나 `LOG_LEVEL`을 높게 설정하면 해당 이벤트가 보이지 않을 수 있다.

서버에서 구분해야 할 조건은 실제 조회 결과 0건, 탐지 기준 미달, 프로세스 미실행·종료, 아직 첫 폴링 전, 로그 레벨·stdout/stderr 수집 누락이다. 4xx/5xx는 기본적으로 집계 키별 최근 5분 요청 수가 20건 이상이어야 하므로, 오류 요청 1건만으로는 알림이 만들어지지 않는다.

### 3. 중간 Job 실패가 이미 탐지한 알림까지 차단함 (수정 완료)

기존 `src/app.ts:13`부터 다섯 Job을 순차적으로 `await`하고, 모두 성공한 후에만 `mailNotification`을 호출했다. Job별 예외 처리와 최상위 폴링 예외 처리가 없었다.

Job별 호출을 독립적으로 감싸도록 수정했다. 첫 Job에서 DDoS를 탐지한 뒤 세 번째 조회에 HTTP 400을 주입해도 `monitoring_job_failed`를 기록하고 나머지 Job을 수행한 뒤 기존 탐지 결과를 SMTP로 발송한다. 기존 QA 계획의 `TC-JOB-FAIL-001`에 해당하는 로컬 모의 검증을 완료했다.

### 4. SMTP 인증이 AUTH PLAIN으로 고정됨 (수정 완료)

기존 `src/jobs/mail-notification.job/job.ts:285`는 서버가 제공하는 인증 방식과 무관하게 사용자명과 비밀번호가 있으면 `AUTH PLAIN`을 전송했다.

EHLO 응답에서 `PLAIN` 또는 `LOGIN`을 선택하고 LOGIN challenge를 처리하도록 수정했다. `AUTH LOGIN`만 광고하는 로컬 SMTP에서 인증 후 메일 1건 수락을 재확인했다. QA 서버가 어떤 방식을 제공하는지는 별도 확인이 필요하다.

## 서버에서 필요한 최소 증거

1. 적용 커밋: `git rev-parse --short HEAD`. 프로세스의 실행 명령, 실행 디렉터리, Node 버전도 함께 확인한다.
2. QA 탐지 유형, 대상 경로·도메인, 요청 수, 발생 시각. 인덱스와 조회 시간 창 안에 해당 로그가 실제로 있는지 확인한다.
3. 시작 직후부터 한 폴링 이상 지난 구간의 stdout와 stderr, 프로세스 생존 여부, `LOG_LEVEL`.
4. `SMTP_HOST`, `SMTP_FROM`, `SMTP_TO`, `SMTP_DOMAIN_RECIPIENTS`, 인증 변수의 `set`/`empty`/`missing` 상태. 비밀번호·인증 문자열·실제 수신자 주소는 공유하지 않는다.
5. SMTP 포트·TLS 방식과 서버의 EHLO 인증 기능 목록. 계정 인증이나 실제 메일 발신 없이 확인 가능한 범위부터 시작한다.
6. 탐지가 있는데 SMTP 연결이 없다면 `mail_notification_skipped`, `mail_notification_template_failed` 및 서버의 `src/mailForm/*.html` 배포 누락 여부를 확인한다.

로컬 `.env`의 SMTP host·발신자·수신자는 비어 있었지만 이는 QA 서버의 설정 증거가 아니다. 모의 검증은 별도 로컬 설정을 주입했고 외부 발신은 하지 않았다.

## 재현 방법과 한계

```bash
npm test
npm run check
node --import tsx /private/tmp/web-log-monitoring-mail-probe.mjs
```

마지막 명령은 조사 중 만든 임시 프로브다. 저장소 루트에서 실행하며, 로컬 `127.0.0.1`의 임의 포트에 HTTP/SMTP 모의 서버를 열고 실제 앱을 자식 프로세스로 실행한다. 시나리오 종료 시 자식 프로세스와 모의 서버를 모두 종료한다. 임시 파일은 장기 회귀 테스트나 배포 산출물이 아니다.

프로브 8개 시나리오의 관찰값을 위 표에 기록했다. 실제 Elasticsearch의 쿼리 해석, STARTTLS·직접 TLS, 운영 SMTP 인증 성공, 스팸 정책, 외부 메일함 도착은 이번 로컬 검증에 포함하지 않았다. PR 본문의 과거 Gmail 수락 기록도 이번 서버의 발신 성공 증거로 사용하지 않는다.
