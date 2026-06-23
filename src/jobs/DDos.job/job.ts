import { config } from '../../config.ts';
import type { DetectionAlert, DetectionLogger } from '../../types/detection.ts';
import type { ElasticsearchLikeClient, EsqlResponse } from '../../types/elastic.ts';
import type { WebLog } from '../../types/web-log.ts';
import { elasticClient } from '../../utils/elastic.client.ts';
import { buildEsqlQueryRequest } from '../../utils/elastic-query.client.ts';
import { logger as defaultLogger } from '../../utils/logger.ts';

type DomainRequestCount = {
    domain: string;
    count: number;
};

export interface DdosDetectionResult extends DetectionAlert {
    type: 'DDOS';
    clientIp: string;
    count: number;
    threshold: number;
    windowMinutes: number;
    domainCounts: DomainRequestCount[];
    reason: string;
}

type DdosDetectionConfig = {
    windowMinutes: number;
    requestThreshold: number;
    excludedIps: string[];
};

type DdosGroup = {
    clientIp: string;
    count: number;
    domainCounts: Map<string, number>;
};

type DdosJobOptions = {
    client?: ElasticsearchLikeClient;
    windowMinutes?: number;
    requestThreshold?: number;
    excludedIps?: string[];
    logger?: DetectionLogger;
};

export function buildDdosEsqlQuery(minutes: number = config.detection.windowMinutes): string {
    return [
        `FROM ${config.elasticsearch.indexPattern}`,
        `| WHERE @timestamp > NOW() - ${minutes}m`,
        '| KEEP @timestamp, client_ip, domain',
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

function parseDdosLogRows(response: EsqlResponse): WebLog[] {
    const { columns, values } = normalizeEsqlResponse(response);
    const timestampIndex = columns.findIndex((column) => column.name === '@timestamp');
    const clientIpIndex = columns.findIndex((column) => column.name === 'client_ip');
    const domainIndex = columns.findIndex((column) => column.name === 'domain');

    if (clientIpIndex === -1 || domainIndex === -1) {
        return [];
    }

    return values
        .map((row) => ({
            timestamp: timestampIndex === -1 ? '' : String(row[timestampIndex]),
            clientIp: String(row[clientIpIndex]),
            domain: String(row[domainIndex]),
            path: '',
            protocolStatus: 0
        }))
        .filter((row) => row.clientIp.length > 0 && row.domain.length > 0);
}

export async function DDosJob({
    client = elasticClient,
    windowMinutes = config.detection.windowMinutes,
    requestThreshold = config.detection.ddosRequestsPerIp,
    excludedIps = config.detection.ddosExcludedIps,
    logger = defaultLogger
}: DdosJobOptions = {}): Promise<DdosDetectionResult[]> {
    const response = await client.transport.request(buildEsqlQueryRequest(buildDdosEsqlQuery(windowMinutes)));
    const results = detectDdosAttempts(parseDdosLogRows(response), {
        windowMinutes,
        requestThreshold,
        excludedIps
    });

    if (results.length > 0) {
        logger.warn({
            event: 'ddos_detected',
            windowMinutes,
            requestThreshold,
            results
        });
    }

    return results;
}

export function detectDdosAttempts(
    logs: WebLog[],
    ddosConfig: DdosDetectionConfig
): DdosDetectionResult[] {
    const groups = new Map<string, DdosGroup>();
    const excludedIps = new Set(ddosConfig.excludedIps);

    for (const log of logs) {
        if (excludedIps.has(log.clientIp)) {
            continue;
        }

        const group = groups.get(log.clientIp) ?? {
            clientIp: log.clientIp,
            count: 0,
            domainCounts: new Map<string, number>()
        };

        group.count += 1;
        group.domainCounts.set(log.domain, (group.domainCounts.get(log.domain) ?? 0) + 1);
        groups.set(log.clientIp, group);
    }

    return Array.from(groups.values())
        .filter((group) => group.count >= ddosConfig.requestThreshold)
        .sort((left, right) => right.count - left.count || left.clientIp.localeCompare(right.clientIp))
        .map((group) => ({
            type: 'DDOS',
            clientIp: group.clientIp,
            count: group.count,
            threshold: ddosConfig.requestThreshold,
            windowMinutes: ddosConfig.windowMinutes,
            domainCounts: Array.from(group.domainCounts.entries())
                .map(([domain, count]) => ({ domain, count }))
                .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain)),
            reason: `${group.clientIp} sent ${group.count} requests within ${ddosConfig.windowMinutes} minutes`
        }));
}
