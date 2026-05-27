import assert from 'node:assert/strict';
import test from 'node:test';

import { buildElasticsearchClientOptions } from '../src/utils/elastic.client.ts';
import { buildEsqlQueryRequest, buildRecentIisLogsEsqlQuery } from '../src/utils/elastic-query.client.ts';
import { logger } from '../src/utils/logger.ts';
import { buildWebErrorEsqlQuery, webErrorJob } from '../src/jobs/web-error.job/job.ts';

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

// 쿼리 문자열이 올바르게 생성되는지 확인 -> FROM iis-*, 시간 범위 필터, KEEP 필드 3가지가 모두 포함되어 있는지 검증
test('buildWebErrorEsqlQuery fetches recent logs for rate-based web error detection', () => {
    const query = buildWebErrorEsqlQuery(10);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 10m/);
    assert.match(query, /KEEP @timestamp, domain, protocol_status/);
});

// shop.gdgoc.net 4xx 비율이 5%로 임계값 10% 미달인 상황 -> detected: false
test('webErrorJob reports no detection when 4xx rate is below threshold', async () => {
    const warnings: unknown[] = [];

    const result = await webErrorJob({
        executeQuery: async () => ({
            columns: [{ name: 'domain' }, { name: 'protocol_status' }],
            values: [
                ...Array.from({ length: 95 }, () => ['shop.gdgoc.net', '200']),
                ...Array.from({ length: 5  }, () => ['shop.gdgoc.net', '404'])
            ]
        }),
        errorRateThresholdPercent: 10,
        windowMinutes: 5,
        excludedDomains: [],
        logger: { warn(d: unknown) { warnings.push(d); } }
    });

    assert.equal(result.detected, false);
    assert.equal(warnings.length, 0);
});

// 탐지 케이스
test('webErrorJob detects web error when 4xx rate meets threshold', async () => {
    const queries: unknown[] = [];
    const warnings: unknown[] = [];

    const result = await webErrorJob({
        executeQuery: async (query) => {
            queries.push(query);
            return {
                columns: [{ name: 'domain' }, { name: 'protocol_status' }],
                values: [
                    ...Array.from({ length: 35 }, () => ['shop.gdgoc.net', '200']),
                    ...Array.from({ length: 10 }, () => ['shop.gdgoc.net', '403']),
                    ...Array.from({ length: 5  }, () => ['shop.gdgoc.net', '404']),
                    ...Array.from({ length: 19 }, () => ['api.gdgoc.net',  '200']),
                    ...Array.from({ length: 1  }, () => ['api.gdgoc.net',  '401']),
                    ['shop.gdgoc.net', '500']
                ]
            };
        },
        errorRateThresholdPercent: 10,
        windowMinutes: 5,
        excludedDomains: [],
        logger: { warn(d: unknown) { warnings.push(d); } }
    });

    assert.equal(result.detected, true);
    assert.equal(queries.length, 1);
    assert.equal(warnings.length, 1);

    const shopFinding = result.domainFindings.find((f) => f.domain === 'shop.gdgoc.net');
    assert.ok(shopFinding);
    assert.equal(shopFinding.errorCount, 15);
    assert.equal(shopFinding.totalRequests, 51);
    assert.equal(shopFinding.errorRatePercent, Math.round((15 / 51) * 10000) / 100);

    const apiFinding = result.domainFindings.find((f) => f.domain === 'api.gdgoc.net');
    assert.ok(apiFinding);
    assert.equal(apiFinding.errorCount, 1);
});

// elastic.gdgoc.net은 4xx 비율이 100%지만 excludedDomains에 등록되어 있어서 domainFindings에 나타나지 않아야 함
test('webErrorJob excludes specified domains from detection', async () => {
    const warnings: unknown[] = [];

    const result = await webErrorJob({
        executeQuery: async () => ({
            columns: [{ name: 'domain' }, { name: 'protocol_status' }],
            values: [
                ...Array.from({ length: 5  }, () => ['elastic.gdgoc.net', '404']),
                ...Array.from({ length: 20 }, () => ['shop.gdgoc.net',    '200']),
                ...Array.from({ length: 15 }, () => ['shop.gdgoc.net',    '404'])
            ]
        }),
        errorRateThresholdPercent: 10,
        windowMinutes: 5,
        excludedDomains: ['elastic.gdgoc.net'],
        logger: { warn(d: unknown) { warnings.push(d); } }
    });

    assert.equal(result.detected, true);
    assert.ok(!result.domainFindings.find((f) => f.domain === 'elastic.gdgoc.net'));
    assert.ok(result.domainFindings.find((f) => f.domain === 'shop.gdgoc.net'));
});
