import { config } from './config.ts';
import { DDosJob } from './jobs/DDos.job/job.ts';
import { bruteForceJob } from './jobs/brute-force.job/job.ts';
import { mailNotification } from './jobs/mail-notification.job/job.ts';
import { sensitivePathJob } from './jobs/sensitive-path.job/job.ts';
import { serverErrorJob } from './jobs/server-error.job/job.ts';
import { webErrorJob } from './jobs/web-error.job/job.ts';
import type { DetectionAlert } from './types/detection.ts';
import { domainErrorFindingsToAlerts } from './utils/domain-error-detection.ts';
import { logger } from './utils/logger.ts';

const jobsPollingMs = config.jobsPollingMinutes * 60 * 1000;

const pollingJobs: Array<{
    name: string;
    run: () => Promise<DetectionAlert[]>;
}> = [
    {
        name: 'ddos',
        run: async () => DDosJob()
    },
    {
        name: 'brute_force',
        run: async () => bruteForceJob()
    },
    {
        name: 'server_error',
        run: async () => domainErrorFindingsToAlerts('SERVER_ERROR', await serverErrorJob())
    },
    {
        name: 'sensitive_path',
        run: async () => sensitivePathJob()
    },
    {
        name: 'web_error',
        run: async () => domainErrorFindingsToAlerts('WEB_ERROR', await webErrorJob())
    }
];

let pollingInProgress = false;

async function runPollingCycle(): Promise<void> {
    if (pollingInProgress) {
        logger.warn({
            event: 'monitoring_poll_skipped',
            reason: 'Previous polling cycle is still running'
        });
        return;
    }

    pollingInProgress = true;
    const startedAt = Date.now();
    const alerts: DetectionAlert[] = [];

    logger.info({
        event: 'monitoring_poll_started',
        pollingMinutes: config.jobsPollingMinutes,
        windowMinutes: config.detection.windowMinutes
    });

    try {
        for (const job of pollingJobs) {
            try {
                const findings = await job.run();
                alerts.push(...findings);
            } catch (error) {
                logger.error({
                    event: 'monitoring_job_failed',
                    job: job.name,
                    message: describeError(error)
                });
            }
        }

        try {
            const result = await mailNotification({ alerts });

            logger.info({
                event: 'mail_notification_completed',
                alertCount: alerts.length,
                sent: result.sent,
                recipientCount: result.recipients.length
            });
        } catch (error) {
            logger.error({
                event: 'mail_notification_failed',
                message: describeError(error),
                alertCount: alerts.length
            });
        }
    } finally {
        pollingInProgress = false;
        logger.info({
            event: 'monitoring_poll_completed',
            alertCount: alerts.length,
            durationMs: Date.now() - startedAt
        });
    }
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown monitoring failure';
}

void runPollingCycle();
setInterval(() => {
    void runPollingCycle();
}, jobsPollingMs);
