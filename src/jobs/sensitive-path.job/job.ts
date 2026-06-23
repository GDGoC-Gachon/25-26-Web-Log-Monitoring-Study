import { config } from '../../config.ts';
import type { DetectionAlert, DetectionLogger } from '../../types/detection.ts';
import type { ElasticsearchLikeClient, EsqlResponse } from '../../types/elastic.ts';
import type { WebLog } from '../../types/web-log.ts';
import { elasticClient } from '../../utils/elastic.client.ts';
import { buildEsqlQueryRequest } from '../../utils/elastic-query.client.ts';
import { logger as defaultLogger } from '../../utils/logger.ts';

export interface SensitivePathDetectionResult extends DetectionAlert {
    type: 'SENSITIVE_PATH';
    clientIp: string;
    path: string;
    matchedPath: string;
    count: number;
    windowMinutes: number;
    reason: string;
}

type SensitivePathDetectionConfig = {
    windowMinutes: number;
    sensitivePaths: string[];
};

type SensitivePathGroup = {
    clientIp: string;
    domain?: string | undefined;
    path: string;
    matchedPath: string;
    count: number;
};

type SensitivePathJobOptions = {
    client?: ElasticsearchLikeClient;
    windowMinutes?: number;
    sensitivePaths?: string[];
    logger?: DetectionLogger;
};

export function buildSensitivePathEsqlQuery(minutes: number = config.detection.windowMinutes): string {
    return [
        `FROM ${config.elasticsearch.indexPattern}`,
        `| WHERE @timestamp > NOW() - ${minutes}m`,
        '| KEEP @timestamp, client_ip, path, domain',
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

function parseSensitivePathLogRows(response: EsqlResponse): WebLog[] {
    const { columns, values } = normalizeEsqlResponse(response);
    const timestampIndex = columns.findIndex((column) => column.name === '@timestamp');
    const clientIpIndex = columns.findIndex((column) => column.name === 'client_ip');
    const domainIndex = columns.findIndex((column) => column.name === 'domain');
    const pathIndex = columns.findIndex((column) => column.name === 'path');

    if (clientIpIndex === -1 || pathIndex === -1) {
        return [];
    }

    return values
        .map((row) => ({
            timestamp: timestampIndex === -1 ? '' : String(row[timestampIndex]),
            clientIp: String(row[clientIpIndex]),
            domain: domainIndex === -1 ? '' : String(row[domainIndex]),
            path: String(row[pathIndex]),
            protocolStatus: 0
        }))
        .filter((row) => row.clientIp.length > 0 && row.path.length > 0);
}

export async function sensitivePathJob({
    client = elasticClient,
    windowMinutes = config.detection.windowMinutes,
    sensitivePaths = config.detection.sensitivePaths,
    logger = defaultLogger
}: SensitivePathJobOptions = {}): Promise<SensitivePathDetectionResult[]> {
    const response = await client.transport.request(buildEsqlQueryRequest(buildSensitivePathEsqlQuery(windowMinutes)));
    const results = detectSensitivePathAccesses(parseSensitivePathLogRows(response), {
        windowMinutes,
        sensitivePaths
    });

    if (results.length > 0) {
        logger.warn({
            event: 'sensitive_path_detected',
            windowMinutes,
            results
        });
    }

    return results;
}

export function detectSensitivePathAccesses(
    logs: WebLog[],
    sensitivePathConfig: SensitivePathDetectionConfig
): SensitivePathDetectionResult[] {
    const groups = new Map<string, SensitivePathGroup>();
    const sensitivePaths = sensitivePathConfig.sensitivePaths.map(normalizeRequestPath);

    for (const log of logs) {
        const path = normalizeRequestPath(log.path);
        const matchedPath = findMatchedSensitivePath(path, sensitivePaths);

        if (!matchedPath) {
            continue;
        }

        const groupKey = `${log.clientIp}\u0000${log.domain}\u0000${path}\u0000${matchedPath}`;
        const group = groups.get(groupKey) ?? {
            clientIp: log.clientIp,
            domain: log.domain || undefined,
            path,
            matchedPath,
            count: 0
        };

        group.count += 1;
        groups.set(groupKey, group);
    }

    return Array.from(groups.values())
        .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
        .map((group) => ({
            type: 'SENSITIVE_PATH',
            clientIp: group.clientIp,
            ...(group.domain ? { domain: group.domain } : {}),
            path: group.path,
            matchedPath: group.matchedPath,
            count: group.count,
            windowMinutes: sensitivePathConfig.windowMinutes,
            reason: `${group.clientIp} accessed sensitive path ${group.path} ${group.count} time(s) within ${sensitivePathConfig.windowMinutes} minutes`
        }));
}

function findMatchedSensitivePath(requestPath: string, sensitivePaths: string[]): string | undefined {
    const normalizedRequestPath = requestPath.toLowerCase();

    return sensitivePaths.find((sensitivePath) => {
        const normalizedSensitivePath = sensitivePath.toLowerCase();

        return normalizedRequestPath === normalizedSensitivePath
            || normalizedRequestPath.startsWith(`${normalizedSensitivePath}/`);
    });
}

function normalizeRequestPath(requestPath: string): string {
    const withoutQuery = (requestPath.split(/[?#]/, 1)[0] || '/').trim();
    const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;

    return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
}
