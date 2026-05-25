import assert from 'node:assert/strict';
import test from 'node:test';

import { buildElasticsearchClientOptions } from '../src/utils/elastic.client.ts';
import { buildEsqlQueryRequest, buildRecentIisLogsEsqlQuery } from '../src/utils/elastic-query.client.ts';
import { buildServerErrorEsqlQuery, extractApiDomain, serverErrorJob } from '../src/jobs/server-error.job/job.ts';
import { logger } from '../src/utils/logger.ts';

test('buildElasticsearchClientOptions builds external API client options with optional basic auth', () => {
    assert.deepEqual(
        buildElasticsearchClientOptions({
            url: 'https://api.gdgoc.net/',
            requestTimeoutMs: 5000
        }),
        {
            node: 'https://api.gdgoc.net',
            requestTimeout: 5000
        }
    );

    assert.deepEqual(
        buildElasticsearchClientOptions({
            url: 'https://api.gdgoc.net/',
            username: 'elastic',
            password: 'secret',
            requestTimeoutMs: 5000
        }),
        {
            node: 'https://api.gdgoc.net',
            auth: {
                username: 'elastic',
                password: 'secret'
            },
            requestTimeout: 5000
        }
    );
});

test('buildEsqlQueryRequest creates the Elasticsearch ES|QL _query request', () => {
    const request = buildEsqlQueryRequest('FROM iis-* | LIMIT 1');

    assert.deepEqual(request, {
        method: 'POST',
        path: '/_query',
        querystring: {
            format: 'json'
        },
        body: {
            query: 'FROM iis-* | LIMIT 1'
        }
    });
});

test('buildRecentIisLogsEsqlQuery keeps the current IIS log fields without implementing detection jobs', () => {
    const query = buildRecentIisLogsEsqlQuery(15);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 15m/);
    assert.match(query, /KEEP @timestamp, c_ip, cs_method, cs_uri_stem, sc_status, time_taken, cs_user_agent/);
});

test('logger exposes an ECS-aware pino logger', () => {
    assert.equal(typeof logger.info, 'function');
});

test('buildServerErrorEsqlQuery fetches recent API requests for rate-based server error detection', () => {
    const query = buildServerErrorEsqlQuery(10);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 10m/);
    assert.match(query, /cs_uri_stem LIKE "\/api\/v1\/%"/);
    assert.match(query, /cs_uri_stem LIKE "\/api\/%"/);
    assert.match(query, /KEEP @timestamp, cs_uri_stem, sc_status/);
});

test('extractApiDomain groups supported API path shapes by domain', () => {
    assert.equal(extractApiDomain('/api/v1/users/profile'), 'users');
    assert.equal(extractApiDomain('/api/orders'), 'orders');
    assert.equal(extractApiDomain('api/v1/payments/approve'), 'payments');
    assert.equal(extractApiDomain('/web/login'), undefined);
});

test('serverErrorJob reports detections by API domain when 5xx rate meets the threshold', async () => {
    const requests: unknown[] = [];
    const warnings: unknown[] = [];
    const client = {
        transport: {
            async request(request: unknown) {
                requests.push(request);

                return {
                    columns: [
                        { name: 'cs_uri_stem' },
                        { name: 'sc_status' }
                    ],
                    values: [
                        ['/api/v1/orders/list', 200],
                        ['/api/v1/orders/list', 500],
                        ['/api/v1/orders/detail', 503],
                        ['/api/v1/users/me', 200],
                        ['/api/v1/users/me', 200],
                        ['/api/users', 500],
                        ['/web/login', 500]
                    ]
                };
            }
        }
    };

    const finding = await serverErrorJob({
        client,
        errorRateThresholdPercent: 50,
        windowMinutes: 5,
        logger: {
            warn(details: unknown) {
                warnings.push(details);
            }
        }
    });

    assert.equal(finding.detected, true);
    assert.deepEqual(finding.domainFindings, [
        {
            domain: 'orders',
            totalRequests: 3,
            errorCount: 2,
            errorRatePercent: 66.67
        },
        {
            domain: 'users',
            totalRequests: 3,
            errorCount: 1,
            errorRatePercent: 33.33
        }
    ]);
    assert.equal(requests.length, 1);
    assert.equal(warnings.length, 1);
});
