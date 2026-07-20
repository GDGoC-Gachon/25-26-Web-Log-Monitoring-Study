import type {
    DetectionAlert,
    DomainErrorDetectionPolicy,
    DomainErrorFinding,
    DomainErrorJobResult
} from '../types/detection.ts';

export function meetsDomainErrorDetectionPolicy(
    finding: DomainErrorFinding,
    policy: DomainErrorDetectionPolicy
): boolean {
    return finding.totalRequests >= policy.minimumRequests
        && finding.errorRatePercent >= policy.errorRateThresholdPercent;
}

export function domainErrorFindingsToAlerts(
    type: 'SERVER_ERROR' | 'WEB_ERROR',
    result: DomainErrorJobResult
): DetectionAlert[] {
    return result.domainFindings
        .filter((finding) => meetsDomainErrorDetectionPolicy(finding, result))
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
