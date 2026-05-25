export const config = {
    jobsPollingMinutes: 1,
    bruteForce: {
        windowMinutes: 5,
        failureThreshold: 5,
        pathKeywords: ['login', 'auth'],
        failureStatuses: [400, 401, 403],
        excludedIps: []
    }
};
