import dotenv from 'dotenv';

dotenv.config();

function parseCsv(value: string | undefined, fallback: string[]): string[] {
    const source = value ?? fallback.join(',');
    return source.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseNumberCsv(value: string | undefined, fallback: number[]): number[] {
    return parseCsv(value, fallback.map(String))
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));
}

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
        get ddosExcludedIps() {
            return parseCsv(process.env.DDOS_EXCLUDED_IPS, []);
        },
        get bruteForceMaxFailures() {
            return Number(process.env.BRUTE_FORCE_MAX_FAILURES ?? 30);
        },
        get bruteForceTargetPaths() {
            return parseCsv(process.env.BRUTE_FORCE_TARGET_PATHS, ['/login', '/auth', '/signin']);
        },
        get bruteForceStatusCodes() {
            return parseNumberCsv(process.env.BRUTE_FORCE_STATUS_CODES, [400, 401, 403]);
        },
        get bruteForceExcludedIps() {
            return parseCsv(process.env.BRUTE_FORCE_EXCLUDED_IPS, []);
        },
        get serverErrorRatePercent() {
            return Number(process.env.SERVER_ERROR_RATE_PERCENT ?? 5);
        },
        get sensitivePaths() {
            return parseCsv(process.env.SENSITIVE_PATHS, ['/.env', '/admin']);
        },
        get webErrorRatePercent() {
            return Number(process.env.WEB_ERROR_RATE_PERCENT ?? 10);
        },
        get excludedDomains() {
            return (process.env.EXCLUDED_DOMAINS ?? '').split(',').filter(Boolean);
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
        },
        get domainRecipients() {
            return process.env.SMTP_DOMAIN_RECIPIENTS;
        }
    }
};
