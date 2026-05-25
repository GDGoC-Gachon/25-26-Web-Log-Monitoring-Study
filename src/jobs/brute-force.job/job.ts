import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config.ts';
import { elasticQueryClient } from '../../utils/elastic-query.client.ts';
import type { WebLog } from '../../types/web-log.ts';

export interface BruteForceDetectionResult {
    type: 'BRUTE_FORCE';
    clientIp: string;
    domain: string;
    count: number;
    threshold: number;
    windowMinutes: number;
    reason: string;
}

interface BruteForceDetectionConfig {
    windowMinutes: number;
    failureThreshold: number;
    pathKeywords: string[];
    failureStatuses: number[];
    excludedIps: string[];
}

interface BruteForceGroup {
    clientIp: string;
    domain: string;
    count: number;
}

export async function bruteForceJob(): Promise<BruteForceDetectionResult[]> {
    const bruteForceConfig = config.bruteForce;

    try {
        const logs = await elasticQueryClient(bruteForceConfig.windowMinutes);
        const results = detectBruteForceAttempts(logs, bruteForceConfig);

        for (const result of results) {
            logInfo(`detected brute force. client_ip=${result.clientIp} domain=${result.domain} count=${result.count} threshold=${result.threshold} window_minutes=${result.windowMinutes}`);
        }

        logInfo(`brute force detection completed. detected=${results.length}`);

        return results;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(errorMessage);

        return [];
    }
}

export function detectBruteForceAttempts(
    logs: WebLog[],
    bruteForceConfig: BruteForceDetectionConfig
): BruteForceDetectionResult[] {
    const groups = new Map<string, BruteForceGroup>();
    const excludedIps = new Set(bruteForceConfig.excludedIps);
    const failureStatuses = new Set(bruteForceConfig.failureStatuses);
    const pathKeywords = bruteForceConfig.pathKeywords.map((keyword) => keyword.toLowerCase());

    for (const log of logs) {
        if (
            excludedIps.has(log.clientIp)
            || !hasAuthPathKeyword(log.path, pathKeywords)
            || !failureStatuses.has(log.protocolStatus)
        ) {
            continue;
        }

        const groupKey = `${log.clientIp}\u0000${log.domain}`;
        const group = groups.get(groupKey) ?? {
            clientIp: log.clientIp,
            domain: log.domain,
            count: 0
        };

        group.count += 1;
        groups.set(groupKey, group);
    }

    return Array.from(groups.values())
        .filter((group) => group.count >= bruteForceConfig.failureThreshold)
        .map((group) => ({
            type: 'BRUTE_FORCE',
            clientIp: group.clientIp,
            domain: group.domain,
            count: group.count,
            threshold: bruteForceConfig.failureThreshold,
            windowMinutes: bruteForceConfig.windowMinutes,
            reason: `${bruteForceConfig.pathKeywords.join('/')} path returned ${bruteForceConfig.failureStatuses.join('/')} at least ${bruteForceConfig.failureThreshold} times within ${bruteForceConfig.windowMinutes} minutes`
        }));
}

function hasAuthPathKeyword(requestPath: string, pathKeywords: string[]): boolean {
    const normalizedPath = requestPath.toLowerCase();

    return pathKeywords.some((keyword) => normalizedPath.includes(keyword));
}

function logInfo(message: string): void {
    const now = new Date();
    const fileName = path.basename(fileURLToPath(import.meta.url));

    console.log(`[${now.toISOString()}] [${fileName}] [INFO] - ${message}`);
}

function logError(message: string): void {
    const now = new Date();
    const fileName = path.basename(fileURLToPath(import.meta.url));

    console.log(`[${now.toISOString()}] [${fileName}] [ERROR] - ${message}`);
}
