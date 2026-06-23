import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bruteForceJob, buildBruteForceEsqlQuery, detectBruteForceAttempts } from './job.ts';
import type { WebLog } from '../../types/web-log.ts';

const baseConfig = {
    windowMinutes: 5,
    failureThreshold: 3,
    pathKeywords: ['login', 'auth'],
    failureStatuses: [400, 401, 403],
    excludedIps: []
};

describe('detectBruteForceAttempts', () => {
    it('detects repeated auth failures for the same client IP and domain', () => {
        const logs: WebLog[] = [
            createLog({ protocolStatus: 401 }),
            createLog({ protocolStatus: 403 }),
            createLog({ protocolStatus: 400 })
        ];

        const results = detectBruteForceAttempts(logs, baseConfig);

        assert.equal(results.length, 1);
        assert.equal(results[0]?.clientIp, '203.0.113.10');
        assert.equal(results[0]?.domain, 'example.com');
        assert.equal(results[0]?.count, 3);
    });

    it('does not detect when the failure count is below the threshold', () => {
        const logs: WebLog[] = [
            createLog({ protocolStatus: 401 }),
            createLog({ protocolStatus: 403 })
        ];

        const results = detectBruteForceAttempts(logs, baseConfig);

        assert.deepEqual(results, []);
    });

    it('excludes configured IP addresses from detection', () => {
        const logs: WebLog[] = [
            createLog({ protocolStatus: 401 }),
            createLog({ protocolStatus: 401 }),
            createLog({ protocolStatus: 401 })
        ];

        const results = detectBruteForceAttempts(logs, {
            ...baseConfig,
            excludedIps: ['203.0.113.10']
        });

        assert.deepEqual(results, []);
    });

    it('ignores non-auth paths and non-failure statuses', () => {
        const logs: WebLog[] = [
            createLog({ path: '/products', protocolStatus: 401 }),
            createLog({ path: '/login', protocolStatus: 200 }),
            createLog({ path: '/AUTH', protocolStatus: 401 }),
            createLog({ path: '/auth', protocolStatus: 403 })
        ];

        const results = detectBruteForceAttempts(logs, baseConfig);

        assert.deepEqual(results, []);
    });
});

describe('bruteForceJob', () => {
    it('queries recent IIS auth logs and returns brute-force findings', async () => {
        const requests: unknown[] = [];
        const warnings: unknown[] = [];

        const results = await bruteForceJob({
            client: {
                transport: {
                    async request(request: unknown) {
                        requests.push(request);

                        return {
                            columns: [
                                { name: '@timestamp' },
                                { name: 'client_ip' },
                                { name: 'domain' },
                                { name: 'path' },
                                { name: 'protocol_status' }
                            ],
                            values: [
                                ['2026-05-25T00:00:00.000Z', '203.0.113.10', 'example.com', '/login', 401],
                                ['2026-05-25T00:00:01.000Z', '203.0.113.10', 'example.com', '/auth', 403]
                            ]
                        };
                    }
                }
            },
            windowMinutes: 10,
            failureThreshold: 2,
            pathKeywords: ['login', 'auth'],
            failureStatuses: [401, 403],
            excludedIps: [],
            logger: {
                warn(details: unknown) {
                    warnings.push(details);
                }
            }
        });

        assert.equal(requests.length, 1);
        assert.equal(results.length, 1);
        assert.equal(results[0]?.threshold, 2);
        assert.equal(results[0]?.windowMinutes, 10);
        assert.equal(warnings.length, 1);
    });
});

it('buildBruteForceEsqlQuery fetches recent auth log fields', () => {
    const query = buildBruteForceEsqlQuery(15);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 15m/);
    assert.match(query, /KEEP @timestamp, client_ip, domain, path, protocol_status/);
});

function createLog(overrides: Partial<WebLog> = {}): WebLog {
    return {
        timestamp: '2026-05-25T00:00:00.000Z',
        clientIp: '203.0.113.10',
        domain: 'example.com',
        path: '/login',
        protocolStatus: 401,
        ...overrides
    };
}
