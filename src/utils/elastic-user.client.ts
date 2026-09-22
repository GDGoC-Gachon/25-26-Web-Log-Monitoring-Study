import type { TransportRequestParams } from '@elastic/transport';

import { config } from '../config.ts';
import { createElasticsearchClient } from './elastic.client.ts';

export type ElasticUserApiClient = {
    transport: {
        request(request: TransportRequestParams): Promise<unknown>;
    };
};

export type ElasticNotificationUser = {
    email: string;
    roles: string[];
};

type ElasticSecurityUserRecord = {
    email?: unknown;
    enabled?: unknown;
    roles?: unknown;
};

const validEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const elasticUserClient: ElasticUserApiClient = createElasticsearchClient({
    url: config.elasticsearch.url,
    username: config.elasticUserApi.username,
    password: config.elasticUserApi.password,
    requestTimeoutMs: config.elasticUserApi.requestTimeoutMs
});

export function buildElasticUserApiRequest(): TransportRequestParams {
    return {
        method: 'GET',
        path: '/_security/user'
    };
}

export async function fetchElasticNotificationUsers(
    client: ElasticUserApiClient = elasticUserClient
): Promise<ElasticNotificationUser[]> {
    const response = await client.transport.request(buildElasticUserApiRequest());
    const userRecords = getElasticSecurityUserRecords(response);

    return Object.values(userRecords).flatMap((user) => {
        if (user.enabled !== true || typeof user.email !== 'string') {
            return [];
        }

        const email = user.email.trim();
        if (!validEmailPattern.test(email)) {
            return [];
        }

        return [{
            email,
            roles: Array.isArray(user.roles)
                ? user.roles.filter((role): role is string => typeof role === 'string')
                : []
        }];
    });
}

function getElasticSecurityUserRecords(response: unknown): Record<string, ElasticSecurityUserRecord> {
    const payload = isRecord(response) && isRecord(response.body) ? response.body : response;

    if (!isRecord(payload)) {
        throw new Error('Elastic security user response is invalid');
    }

    return payload;
}

function isRecord(value: unknown): value is Record<string, ElasticSecurityUserRecord> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
