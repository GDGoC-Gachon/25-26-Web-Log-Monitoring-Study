import dotenv from 'dotenv';
dotenv.config();

import { config } from './config.ts';
import { bruteForceJob } from './jobs/brute-force.job/job.ts';
import { DDosJob } from './jobs/DDos.job/job.ts';
import { serverErrorJob } from './jobs/server-error.job/job.ts';
import { webErrorJob } from './jobs/web-error.job/job.ts';
import { mailNotification } from './jobs/mail-notification.job/job.ts';


const jobsPollingMinutes = config.jobsPollingMinutes;

setInterval(async () => {
    await bruteForceJob();
    await DDosJob();
    await serverErrorJob();
    await webErrorJob();
    await mailNotification();
}, jobsPollingMinutes);