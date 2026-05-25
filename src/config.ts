export const config = {
    get jobsPollingMinutes() {
        return Number(process.env.JOBS_POLLING_MINUTES ?? 1);
    },
    elasticsearch: {
        get url() {
            return process.env.ELASTICSEARCH_URL ?? 'https://api.gdgoc.net';
        },
        get username() {
            return process.env.ELASTIC_USERNAME;
        },
        get password() {
            return process.env.ELASTIC_PASSWORD;
        },
        get requestTimeoutMs() {
            return Number(process.env.ELASTICSEARCH_TIMEOUT_MS ?? 10000);
        },
        get indexPattern() {
            return process.env.ELASTICSEARCH_INDEX_PATTERN ?? 'iis-*';
        }
    },
    detection: {
        get windowMinutes() {
            return Number(process.env.DETECTION_WINDOW_MINUTES ?? 5);
        },
        get ddosRequestsPerIp() {
            return Number(process.env.DDOS_REQUESTS_PER_IP ?? 300);
        },
        get serverErrorCount() {
            return Number(process.env.SERVER_ERROR_COUNT ?? 50);
        },
        get sensitivePaths() {
            return process.env.SENSITIVE_PATHS ?? '/.env,/admin';
        }
    },
    smtp: {
        get host() {
            return process.env.SMTP_HOST;
        },
        get port() {
            return Number(process.env.SMTP_PORT ?? 587);
        },
        get secure() {
            return process.env.SMTP_SECURE === 'true';
        },
        get username() {
            return process.env.SMTP_USERNAME;
        },
        get password() {
            return process.env.SMTP_PASSWORD;
        },
        get from() {
            return process.env.SMTP_FROM;
        },
        get to() {
            return process.env.SMTP_TO;
        }
    }
};
