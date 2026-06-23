import { config } from '../../config.ts';
import { elasticClient } from '../../utils/elastic.client.ts';
import { buildEsqlQueryRequest } from '../../utils/elastic-query.client.ts';
import { logger as defaultLogger } from '../../utils/logger.ts';
import type { DetectionLogger } from '../../types/detection.ts';
import type { ElasticsearchLikeClient, EsqlResponse } from '../../types/elastic.ts';
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

type BruteForceJobOptions = {
    client?: ElasticsearchLikeClient;
    windowMinutes?: number;
    failureThreshold?: number;
    pathKeywords?: string[];
    failureStatuses?: number[];
    excludedIps?: string[];
    logger?: DetectionLogger;
};

export function buildBruteForceEsqlQuery(minutes: number = config.detection.windowMinutes): string {
    return [
        `FROM ${config.elasticsearch.indexPattern}`,
        `| WHERE @timestamp > NOW() - ${minutes}m`,
        '| KEEP @timestamp, client_ip, domain, path, protocol_status',
        '| SORT @timestamp DESC'
    ].join(' ');
}

function normalizeEsqlResponse(response: EsqlResponse): Required<Pick<EsqlResponse, 'columns' | 'values'>> {
    const normalized = response.body ?? response;

    return {
        columns: normalized.columns ?? [],
        values: normalized.values ?? []
    };
}

function parseBruteForceLogRows(response: EsqlResponse): WebLog[] {
    const { columns, values } = normalizeEsqlResponse(response);
    const timestampIndex = columns.findIndex((column) => column.name === '@timestamp');
    const clientIpIndex = columns.findIndex((column) => column.name === 'client_ip');
    const domainIndex = columns.findIndex((column) => column.name === 'domain');
    const pathIndex = columns.findIndex((column) => column.name === 'path');
    const statusIndex = columns.findIndex((column) => column.name === 'protocol_status');

    if (clientIpIndex === -1 || domainIndex === -1 || pathIndex === -1 || statusIndex === -1) {
        return [];
    }

    return values
        .map((row) => ({
            timestamp: timestampIndex === -1 ? '' : String(row[timestampIndex]),
            clientIp: String(row[clientIpIndex]),
            domain: String(row[domainIndex]),
            path: String(row[pathIndex]),
            protocolStatus: Number(row[statusIndex])
        }))
        .filter((row) => row.clientIp.length > 0 && row.domain.length > 0 && row.path.length > 0 && Number.isFinite(row.protocolStatus));
}

export async function bruteForceJob({
    client = elasticClient,
    windowMinutes = config.detection.windowMinutes,
    failureThreshold = config.detection.bruteForceMaxFailures,
    pathKeywords = config.detection.bruteForceTargetPaths,
    failureStatuses = config.detection.bruteForceStatusCodes,
    excludedIps = config.detection.bruteForceExcludedIps,
    logger = defaultLogger
}: BruteForceJobOptions = {}): Promise<BruteForceDetectionResult[]> {
    const bruteForceConfig = {
        windowMinutes,
        failureThreshold,
        pathKeywords,
        failureStatuses,
        excludedIps
    };
    const response = await client.transport.request(buildEsqlQueryRequest(buildBruteForceEsqlQuery(windowMinutes)));
    const results = detectBruteForceAttempts(parseBruteForceLogRows(response), bruteForceConfig);

    if (results.length > 0) {
        logger.warn({
            event: 'brute_force_detected',
            windowMinutes,
            failureThreshold,
            results
        });
    }

    return results;
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
