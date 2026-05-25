import type { TransportRequestParams } from '@elastic/transport';
import { elasticClient } from './elastic.client.ts';
import { logger } from './logger.ts';

export async function elasticQueryClient(minutes: number) {
    try {
        const response = await elasticClient.transport.request(buildRecentIisLogsQueryRequest(minutes));

        return isEsqlValuesResponse(response) ? response.values : [];
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error(
            {
                event: {
                    action: 'iis-esql-query-failed'
                },
                error: {
                    message: errorMessage
                }
            },
            'IIS ES|QL query failed'
        );

        return [];
    }
}

export function buildRecentIisLogsEsqlQuery(minutes: number) {
    return [
        'FROM iis-*',
        `| WHERE @timestamp > NOW() - ${minutes}m`,
        '| KEEP @timestamp, c_ip, cs_method, cs_uri_stem, sc_status, time_taken, cs_user_agent',
        '| SORT @timestamp DESC'
    ].join(' ');
}

export function buildRecentIisLogsQueryRequest(minutes: number): TransportRequestParams {
    return {
        method: 'POST',
        path: '/_query',
        querystring: {
            format: 'json'
        },
        body: {
            query: buildRecentIisLogsEsqlQuery(minutes)
        }
    };
}

function isEsqlValuesResponse(response: unknown): response is { values: unknown[] } {
    return typeof response === 'object'
        && response !== null
        && Array.isArray((response as { values?: unknown }).values);
}
