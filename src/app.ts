import { config } from './config.ts';
import { DDosJob } from './jobs/DDos.job/job.ts';
import { mailNotification } from './jobs/mail-notification.job/job.ts';
import { sensitivePathJob } from './jobs/sensitive-path.job/job.ts';
import { serverErrorJob } from './jobs/server-error.job/job.ts';

const jobsPollingMs = config.jobsPollingMinutes * 60 * 1000;

setInterval(async () => {
    await DDosJob();
    await serverErrorJob();
    await sensitivePathJob();
    await mailNotification();
}, jobsPollingMs);
