import type { TransportRequestParams } from '@elastic/transport';
import { config } from '../../config.ts';
import { elasticClient } from '../../utils/elastic.client.ts';
import { buildEsqlQueryRequest } from '../../utils/elastic-query.client.ts';
import { logger as defaultLogger } from '../../utils/logger.ts';

type ServerErrorStatusBreakdown = {
    status: number;
    count: number;
};

type ServerErrorJobResult = {
    detected: boolean;
    errorCount: number;
    threshold: number;
    windowMinutes: number;
    statusBreakdown: ServerErrorStatusBreakdown[];
};

type EsqlColumn = {
    name: string;
};

type EsqlResponse = {
    columns?: EsqlColumn[];
    values?: unknown[][];
    body?: EsqlResponse;
};

type ElasticsearchLikeClient = {
    transport: {
        request(request: TransportRequestParams): Promise<EsqlResponse>;
    };
};

type ServerErrorLogger = {
    warn(details: unknown): void;
};

type ServerErrorJobOptions = {
    client?: ElasticsearchLikeClient;
    threshold?: number;
    windowMinutes?: number;
    logger?: ServerErrorLogger;
};

export function buildServerErrorEsqlQuery(minutes: number = config.detection.windowMinutes) {
    return [
        `FROM ${config.elasticsearch.indexPattern}`,
        `| WHERE @timestamp > NOW() - ${minutes}m`,
        '| WHERE sc_status >= 500 AND sc_status < 600',
        '| STATS error_count = COUNT(*) BY sc_status',
        '| SORT error_count DESC'
    ].join(' ');
}

function normalizeEsqlResponse(response: EsqlResponse): Required<Pick<EsqlResponse, 'columns' | 'values'>> {
    const normalized = response.body ?? response;

    return {
        columns: normalized.columns ?? [],
        values: normalized.values ?? []
    };
}

function parseServerErrorStatusBreakdown(response: EsqlResponse): ServerErrorStatusBreakdown[] {
    const { columns, values } = normalizeEsqlResponse(response);
    const statusIndex = columns.findIndex((column) => column.name === 'sc_status');
    const countIndex = columns.findIndex((column) => column.name === 'error_count');

    if (statusIndex === -1 || countIndex === -1) {
        return [];
    }

    return values
        .map((row) => ({
            status: Number(row[statusIndex]),
            count: Number(row[countIndex])
        }))
        .filter(({ status, count }) => Number.isFinite(status) && Number.isFinite(count));
}

export async function serverErrorJob({
    client = elasticClient,
    threshold = config.detection.serverErrorCount,
    windowMinutes = config.detection.windowMinutes,
    logger = defaultLogger
}: ServerErrorJobOptions = {}): Promise<ServerErrorJobResult> {
    const response = await client.transport.request(buildEsqlQueryRequest(buildServerErrorEsqlQuery(windowMinutes)));
    const statusBreakdown = parseServerErrorStatusBreakdown(response);
    const errorCount = statusBreakdown.reduce((total, entry) => total + entry.count, 0);
    const detected = errorCount >= threshold;

    if (detected) {
        logger.warn({
            event: 'server_error_detected',
            errorCount,
            threshold,
            windowMinutes,
            statusBreakdown
        });
    }

    return {
        detected,
        errorCount,
        threshold,
        windowMinutes,
        statusBreakdown
    };
}
