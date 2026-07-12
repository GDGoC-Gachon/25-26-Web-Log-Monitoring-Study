import { config } from './config.ts';
import { DDosJob } from './jobs/DDos.job/job.ts';
import { bruteForceJob } from './jobs/brute-force.job/job.ts';
import { mailNotification } from './jobs/mail-notification.job/job.ts';
import { sensitivePathJob } from './jobs/sensitive-path.job/job.ts';
import { serverErrorJob } from './jobs/server-error.job/job.ts';
import { webErrorJob } from './jobs/web-error.job/job.ts';
import { domainErrorFindingsToAlerts } from './utils/domain-error-detection.ts';

const jobsPollingMs = config.jobsPollingMinutes * 60 * 1000;

setInterval(async () => {
    const ddosFindings = await DDosJob();
    const bruteForceFindings = await bruteForceJob();
    const serverErrorResult = await serverErrorJob();
    const sensitivePathFindings = await sensitivePathJob();
    const webErrorResult = await webErrorJob();

    await mailNotification({
        alerts: [
            ...ddosFindings,
            ...bruteForceFindings,
            ...sensitivePathFindings,
            ...domainErrorFindingsToAlerts('SERVER_ERROR', serverErrorResult),
            ...domainErrorFindingsToAlerts('WEB_ERROR', webErrorResult)
        ]
    });
}, jobsPollingMs);
