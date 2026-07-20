import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../src/config.ts';
import { buildElasticsearchClientOptions } from '../src/utils/elastic.client.ts';
import { buildEsqlQueryRequest, buildRecentIisLogsEsqlQuery } from '../src/utils/elastic-query.client.ts';
import { buildServerErrorEsqlQuery, extractApiDomain, serverErrorJob } from '../src/jobs/server-error.job/job.ts';
import { domainErrorFindingsToAlerts } from '../src/utils/domain-error-detection.ts';
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

test('buildRecentIisLogsEsqlQuery keeps the current IIS log fields', () => {
    const query = buildRecentIisLogsEsqlQuery(15);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 15m/);
    assert.match(query, /KEEP @timestamp, client_ip, http_method, path, protocol_status, time_taken, user_agent/);
});

test('logger exposes an ECS-aware pino logger', () => {
    assert.equal(typeof logger.info, 'function');
});

test('config reads polling and detection windows from environment variables', () => {
    const previousJobsPollingMinutes = process.env.JOBS_POLLING_MINUTES;
    const previousDetectionWindowMinutes = process.env.DETECTION_WINDOW_MINUTES;
    const previousWebErrorMinRequests = process.env.WEB_ERROR_MIN_REQUESTS;
    const previousServerErrorMinRequests = process.env.SERVER_ERROR_MIN_REQUESTS;

    try {
        delete process.env.WEB_ERROR_MIN_REQUESTS;
        delete process.env.SERVER_ERROR_MIN_REQUESTS;

        assert.equal(config.detection.webErrorMinRequests, 20);
        assert.equal(config.detection.serverErrorMinRequests, 20);

        process.env.JOBS_POLLING_MINUTES = '7';
        process.env.DETECTION_WINDOW_MINUTES = '11';
        process.env.WEB_ERROR_MIN_REQUESTS = '23';
        process.env.SERVER_ERROR_MIN_REQUESTS = '24';

        assert.equal(config.jobsPollingMinutes, 7);
        assert.equal(config.detection.windowMinutes, 11);
        assert.equal(config.detection.webErrorMinRequests, 23);
        assert.equal(config.detection.serverErrorMinRequests, 24);
    } finally {
        restoreEnvValue('JOBS_POLLING_MINUTES', previousJobsPollingMinutes);
        restoreEnvValue('DETECTION_WINDOW_MINUTES', previousDetectionWindowMinutes);
        restoreEnvValue('WEB_ERROR_MIN_REQUESTS', previousWebErrorMinRequests);
        restoreEnvValue('SERVER_ERROR_MIN_REQUESTS', previousServerErrorMinRequests);
    }
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
        minimumRequests: 20,
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
                    ['api.gdgoc.net', '401'],
                    ['shop.gdgoc.net', '500']
                ]
            };
        },
        errorRateThresholdPercent: 10,
        minimumRequests: 20,
        windowMinutes: 5,
        excludedDomains: [],
        logger: { warn(d: unknown) { warnings.push(d); } }
    });

    assert.equal(result.detected, true);
    assert.equal(result.minimumRequests, 20);
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
    assert.equal(apiFinding.errorRatePercent, 100);

    const warning = warnings[0] as { domainFindings: Array<{ domain: string }> };
    assert.deepEqual(warning.domainFindings.map((finding) => finding.domain), ['shop.gdgoc.net']);
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
        minimumRequests: 20,
        windowMinutes: 5,
        excludedDomains: ['elastic.gdgoc.net'],
        logger: { warn(d: unknown) { warnings.push(d); } }
    });

    assert.equal(result.detected, true);
    assert.ok(!result.domainFindings.find((f) => f.domain === 'elastic.gdgoc.net'));
    assert.ok(result.domainFindings.find((f) => f.domain === 'shop.gdgoc.net'));
});

test('webErrorJob ignores a 100% 4xx rate below the minimum request count', async () => {
    const warnings: unknown[] = [];

    const result = await webErrorJob({
        executeQuery: async () => ({
            columns: [{ name: 'domain' }, { name: 'protocol_status' }],
            values: [['shop.gdgoc.net', '404']]
        }),
        errorRateThresholdPercent: 10,
        minimumRequests: 20,
        windowMinutes: 5,
        excludedDomains: [],
        logger: { warn(details: unknown) { warnings.push(details); } }
    });

    assert.equal(result.detected, false);
    assert.equal(result.domainFindings[0]?.errorRatePercent, 100);
    assert.equal(warnings.length, 0);
});

test('webErrorJob applies the rate threshold at the minimum request count', async () => {
    const warnings: unknown[] = [];

    const result = await webErrorJob({
        executeQuery: async () => ({
            columns: [{ name: 'domain' }, { name: 'protocol_status' }],
            values: [
                ...Array.from({ length: 18 }, () => ['shop.gdgoc.net', '200']),
                ...Array.from({ length: 2 }, () => ['shop.gdgoc.net', '404'])
            ]
        }),
        errorRateThresholdPercent: 10,
        minimumRequests: 20,
        windowMinutes: 5,
        excludedDomains: [],
        logger: { warn(details: unknown) { warnings.push(details); } }
    });

    assert.equal(result.detected, true);
    assert.equal(result.domainFindings[0]?.totalRequests, 20);
    assert.equal(result.domainFindings[0]?.errorRatePercent, 10);
    assert.equal(warnings.length, 1);
});

test('webErrorJob applies the minimum request count to each domain independently', async () => {
    const result = await webErrorJob({
        executeQuery: async () => ({
            columns: [{ name: 'domain' }, { name: 'protocol_status' }],
            values: [
                ...Array.from({ length: 10 }, () => ['a.gdgoc.net', '404']),
                ...Array.from({ length: 10 }, () => ['b.gdgoc.net', '404'])
            ]
        }),
        errorRateThresholdPercent: 10,
        minimumRequests: 20,
        windowMinutes: 5,
        excludedDomains: [],
        logger: { warn() { assert.fail('warning should not be emitted'); } }
    });

    assert.equal(result.detected, false);
    assert.equal(result.domainFindings.length, 2);
    assert.ok(result.domainFindings.every((finding) => finding.errorRatePercent === 100));
});

test('buildServerErrorEsqlQuery fetches recent API requests for rate-based server error detection', () => {
    const query = buildServerErrorEsqlQuery(10);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 10m/);
    assert.match(query, /path LIKE "\/api\/v1\/%"/);
    assert.match(query, /path LIKE "\/api\/%"/);
    assert.match(query, /KEEP @timestamp, path, protocol_status/);
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
                        { name: 'path' },
                        { name: 'protocol_status' }
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
        minimumRequests: 1,
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

test('serverErrorJob excludes specified API domains from detection', async () => {
    const warnings: unknown[] = [];

    const finding = await serverErrorJob({
        client: {
            transport: {
                async request() {
                    return {
                        columns: [
                            { name: 'path' },
                            { name: 'protocol_status' }
                        ],
                        values: [
                            ['/api/v1/orders/list', 500],
                            ['/api/v1/orders/detail', 500],
                            ['/api/v1/users/me', 500],
                            ['/api/v1/users/me', 200]
                        ]
                    };
                }
            }
        },
        errorRateThresholdPercent: 50,
        minimumRequests: 1,
        windowMinutes: 5,
        excludedDomains: ['orders'],
        logger: {
            warn(details: unknown) {
                warnings.push(details);
            }
        }
    });

    assert.equal(finding.detected, true);
    assert.ok(!finding.domainFindings.find((domainFinding) => domainFinding.domain === 'orders'));
    assert.deepEqual(finding.domainFindings, [
        {
            domain: 'users',
            totalRequests: 2,
            errorCount: 1,
            errorRatePercent: 50
        }
    ]);
    assert.equal(warnings.length, 1);
});

test('serverErrorJob ignores a 100% 5xx rate below the minimum request count', async () => {
    const warnings: unknown[] = [];

    const result = await serverErrorJob({
        client: {
            transport: {
                async request() {
                    return {
                        columns: [
                            { name: 'path' },
                            { name: 'protocol_status' }
                        ],
                        values: [['/api/v1/orders/list', 500]]
                    };
                }
            }
        },
        errorRateThresholdPercent: 5,
        minimumRequests: 20,
        windowMinutes: 5,
        excludedDomains: [],
        logger: { warn(details: unknown) { warnings.push(details); } }
    });

    assert.equal(result.detected, false);
    assert.equal(result.domainFindings[0]?.errorRatePercent, 100);
    assert.equal(warnings.length, 0);
});

test('serverErrorJob applies the rate threshold at the minimum request count', async () => {
    const warnings: unknown[] = [];

    const result = await serverErrorJob({
        client: {
            transport: {
                async request() {
                    return {
                        columns: [
                            { name: 'path' },
                            { name: 'protocol_status' }
                        ],
                        values: [
                            ...Array.from({ length: 19 }, () => ['/api/v1/orders/list', 200]),
                            ['/api/v1/orders/list', 500]
                        ]
                    };
                }
            }
        },
        errorRateThresholdPercent: 5,
        minimumRequests: 20,
        windowMinutes: 5,
        excludedDomains: [],
        logger: { warn(details: unknown) { warnings.push(details); } }
    });

    assert.equal(result.detected, true);
    assert.equal(result.domainFindings[0]?.totalRequests, 20);
    assert.equal(result.domainFindings[0]?.errorRatePercent, 5);
    assert.equal(warnings.length, 1);
});

test('domainErrorFindingsToAlerts keeps the minimum request floor during final alert conversion', () => {
    const alerts = domainErrorFindingsToAlerts('WEB_ERROR', {
        detected: true,
        errorRateThresholdPercent: 10,
        minimumRequests: 20,
        windowMinutes: 5,
        domainFindings: [
            {
                domain: 'low-traffic.gdgoc.net',
                totalRequests: 1,
                errorCount: 1,
                errorRatePercent: 100
            },
            {
                domain: 'shop.gdgoc.net',
                totalRequests: 20,
                errorCount: 2,
                errorRatePercent: 10
            }
        ]
    });

    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]?.domain, 'shop.gdgoc.net');
});

function restoreEnvValue(name: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[name];
        return;
    }

    process.env[name] = value;
}
