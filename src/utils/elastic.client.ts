import { Client } from '@elastic/elasticsearch';
import { config } from '../config.ts';

type ElasticsearchClientOptions = ConstructorParameters<typeof Client>[0];

type ElasticsearchConnectionConfig = {
    url: string;
    username?: string | undefined;
    password?: string | undefined;
    requestTimeoutMs: number;
};

export function buildElasticsearchClientOptions(connectionConfig: ElasticsearchConnectionConfig): ElasticsearchClientOptions {
    if ((connectionConfig.username && !connectionConfig.password) || (!connectionConfig.username && connectionConfig.password)) {
        throw new Error('ELASTICSEARCH username and password must be configured together');
    }

    return {
        node: connectionConfig.url.replace(/\/$/, ''),
        ...(connectionConfig.username && connectionConfig.password
            ? {
                auth: {
                    username: connectionConfig.username,
                    password: connectionConfig.password
                }
            }
            : {}),
        requestTimeout: connectionConfig.requestTimeoutMs
    };
}

export function createElasticsearchClient(connectionConfig: ElasticsearchConnectionConfig = {
    url: config.elasticsearch.url,
    username: config.elasticsearch.username,
    password: config.elasticsearch.password,
    requestTimeoutMs: config.elasticsearch.requestTimeoutMs
}) {
    return new Client(buildElasticsearchClientOptions(connectionConfig));
}

export const elasticClient = createElasticsearchClient();
