import assert from 'node:assert/strict';
import test from 'node:test';

import { buildElasticsearchClientOptions } from '../src/utils/elastic.client.ts';
import { buildEsqlQueryRequest, buildRecentIisLogsEsqlQuery } from '../src/utils/elastic-query.client.ts';
import { buildServerErrorEsqlQuery, serverErrorJob } from '../src/jobs/server-error.job/job.ts';
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

test('buildServerErrorEsqlQuery counts recent HTTP 5xx responses by status', () => {
    const query = buildServerErrorEsqlQuery(10);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 10m/);
    assert.match(query, /sc_status >= 500/);
    assert.match(query, /sc_status < 600/);
    assert.match(query, /STATS error_count = COUNT\(\*\) BY sc_status/);
});

test('serverErrorJob reports a detection when total 5xx responses meet the threshold', async () => {
    const requests: unknown[] = [];
    const warnings: unknown[] = [];
    const client = {
        transport: {
            async request(request: unknown) {
                requests.push(request);

                return {
                    columns: [
                        { name: 'sc_status' },
                        { name: 'error_count' }
                    ],
                    values: [
                        [500, 4],
                        [503, 3]
                    ]
                };
            }
        }
    };

    const finding = await serverErrorJob({
        client,
        threshold: 7,
        windowMinutes: 5,
        logger: {
            warn(details: unknown) {
                warnings.push(details);
            }
        }
    });

    assert.equal(finding.detected, true);
    assert.equal(finding.errorCount, 7);
    assert.deepEqual(finding.statusBreakdown, [
        { status: 500, count: 4 },
        { status: 503, count: 3 }
    ]);
    assert.equal(requests.length, 1);
    assert.equal(warnings.length, 1);
});
