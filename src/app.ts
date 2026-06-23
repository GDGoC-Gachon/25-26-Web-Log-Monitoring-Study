import { config } from './config.ts';
import { DDosJob } from './jobs/DDos.job/job.ts';
import { bruteForceJob } from './jobs/brute-force.job/job.ts';
import { mailNotification } from './jobs/mail-notification.job/job.ts';
import { sensitivePathJob } from './jobs/sensitive-path.job/job.ts';
import { serverErrorJob } from './jobs/server-error.job/job.ts';
import { webErrorJob } from './jobs/web-error.job/job.ts';
import type { DetectionAlert, DomainErrorFinding } from './types/detection.ts';

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

type DomainErrorJobResult = {
    errorRateThresholdPercent: number;
    windowMinutes: number;
    domainFindings: DomainErrorFinding[];
};

function domainErrorFindingsToAlerts(
    type: 'SERVER_ERROR' | 'WEB_ERROR',
    result: DomainErrorJobResult
): DetectionAlert[] {
    return result.domainFindings
        .filter((finding) => finding.errorRatePercent >= result.errorRateThresholdPercent)
        .map((finding) => ({
            type,
            domain: finding.domain,
            totalRequests: finding.totalRequests,
            errorCount: finding.errorCount,
            errorRatePercent: finding.errorRatePercent,
            threshold: result.errorRateThresholdPercent,
            windowMinutes: result.windowMinutes,
            reason: `${finding.domain} ${type === 'SERVER_ERROR' ? '5xx' : '4xx'} rate ${finding.errorRatePercent}% met threshold ${result.errorRateThresholdPercent}%`
        }));
}
