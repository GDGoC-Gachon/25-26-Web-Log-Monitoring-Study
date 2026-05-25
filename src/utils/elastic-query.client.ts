import type { TransportRequestParams } from '@elastic/transport';
import { config } from '../config.ts';

export function buildEsqlQueryRequest(query: string): TransportRequestParams {
    return {
        method: 'POST',
        path: '/_query',
        querystring: {
            format: 'json'
        },
        body: {
            query
        }
    };
}

export function buildRecentIisLogsEsqlQuery(minutes: number = config.detection.windowMinutes) {
    return [
        `FROM ${config.elasticsearch.indexPattern}`,
        `| WHERE @timestamp > NOW() - ${minutes}m`,
        '| KEEP @timestamp, c_ip, cs_method, cs_uri_stem, sc_status, time_taken, cs_user_agent',
        '| SORT @timestamp DESC'
    ].join(' ');
}
