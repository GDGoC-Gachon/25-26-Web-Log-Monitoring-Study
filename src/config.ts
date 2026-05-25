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
        }
    }
};
