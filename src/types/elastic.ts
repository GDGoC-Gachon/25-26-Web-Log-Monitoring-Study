import type { TransportRequestParams } from '@elastic/transport';

export type EsqlColumn = {
    name: string;
};

export type EsqlResponse = {
    columns?: EsqlColumn[];
    values?: unknown[][];
    body?: EsqlResponse;
};

export type ElasticsearchLikeClient = {
    transport: {
        request(request: TransportRequestParams): Promise<EsqlResponse>;
    };
};

export type EsqlQueryExecutor = (query: string) => Promise<EsqlResponse>;
