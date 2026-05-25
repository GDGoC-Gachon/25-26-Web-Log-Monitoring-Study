import type { TransportRequestParams } from '@elastic/transport';
import { config } from '../../config.ts';
import { elasticClient } from '../../utils/elastic.client.ts';
import { buildEsqlQueryRequest } from '../../utils/elastic-query.client.ts';
import { logger as defaultLogger } from '../../utils/logger.ts';

type ServerErrorDomainFinding = {
    domain: string;
    totalRequests: number;
    errorCount: number;
    errorRatePercent: number;
};

type ServerErrorJobResult = {
    detected: boolean;
    errorRateThresholdPercent: number;
    windowMinutes: number;
    domainFindings: ServerErrorDomainFinding[];
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
    errorRateThresholdPercent?: number;
    windowMinutes?: number;
    logger?: ServerErrorLogger;
};

export function buildServerErrorEsqlQuery(minutes: number = config.detection.windowMinutes) {
    return [
        `FROM ${config.elasticsearch.indexPattern}`,
        `| WHERE @timestamp > NOW() - ${minutes}m`,
        '| WHERE cs_uri_stem LIKE "/api/v1/%" OR cs_uri_stem LIKE "/api/%"',
        '| KEEP @timestamp, cs_uri_stem, sc_status',
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

type ServerErrorLogRow = {
    path: string;
    status: number;
};

export function extractApiDomain(path: string): string | undefined {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const match = normalizedPath.match(/^\/api(?:\/v1)?\/([^/?#]+)/);

    return match?.[1];
}

function parseServerErrorLogRows(response: EsqlResponse): ServerErrorLogRow[] {
    const { columns, values } = normalizeEsqlResponse(response);
    const pathIndex = columns.findIndex((column) => column.name === 'cs_uri_stem');
    const statusIndex = columns.findIndex((column) => column.name === 'sc_status');

    if (pathIndex === -1 || statusIndex === -1) {
        return [];
    }

    return values
        .map((row) => ({
            path: String(row[pathIndex]),
            status: Number(row[statusIndex])
        }))
        .filter(({ path, status }) => path.length > 0 && Number.isFinite(status));
}

function roundRatePercent(errorCount: number, totalRequests: number): number {
    if (totalRequests === 0) {
        return 0;
    }

    return Math.round((errorCount / totalRequests) * 10000) / 100;
}

function buildDomainFindings(rows: ServerErrorLogRow[]): ServerErrorDomainFinding[] {
    const domainStats = new Map<string, Omit<ServerErrorDomainFinding, 'domain' | 'errorRatePercent'>>();

    for (const row of rows) {
        const domain = extractApiDomain(row.path);

        if (!domain) {
            continue;
        }

        const stats = domainStats.get(domain) ?? {
            totalRequests: 0,
            errorCount: 0
        };

        stats.totalRequests += 1;

        if (row.status >= 500 && row.status < 600) {
            stats.errorCount += 1;
        }

        domainStats.set(domain, stats);
    }

    return [...domainStats.entries()]
        .map(([domain, stats]) => ({
            domain,
            totalRequests: stats.totalRequests,
            errorCount: stats.errorCount,
            errorRatePercent: roundRatePercent(stats.errorCount, stats.totalRequests)
        }))
        .sort((left, right) => right.errorRatePercent - left.errorRatePercent || right.errorCount - left.errorCount);
}

export async function serverErrorJob({
    client = elasticClient,
    errorRateThresholdPercent = config.detection.serverErrorRatePercent,
    windowMinutes = config.detection.windowMinutes,
    logger = defaultLogger
}: ServerErrorJobOptions = {}): Promise<ServerErrorJobResult> {
    const response = await client.transport.request(buildEsqlQueryRequest(buildServerErrorEsqlQuery(windowMinutes)));
    const domainFindings = buildDomainFindings(parseServerErrorLogRows(response));
    const detected = domainFindings.some((finding) => finding.errorRatePercent >= errorRateThresholdPercent);

    if (detected) {
        logger.warn({
            event: 'server_error_detected',
            errorRateThresholdPercent,
            windowMinutes,
            domainFindings
        });
    }

    return {
        detected,
        errorRateThresholdPercent,
        windowMinutes,
        domainFindings
    };
}
