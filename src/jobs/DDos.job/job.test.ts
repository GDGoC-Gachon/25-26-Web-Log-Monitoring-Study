import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DDosJob, buildDdosEsqlQuery, detectDdosAttempts } from './job.ts';
import type { WebLog } from '../../types/web-log.ts';

const baseConfig = {
    windowMinutes: 5,
    requestThreshold: 3,
    excludedIps: []
};

describe('detectDdosAttempts', () => {
    it('detects high request volume for the same client IP and includes domain counts', () => {
        const logs: WebLog[] = [
            createLog({ domain: 'api.gdgoc.net' }),
            createLog({ domain: 'api.gdgoc.net' }),
            createLog({ domain: 'shop.gdgoc.net' })
        ];

        const results = detectDdosAttempts(logs, baseConfig);

        assert.equal(results.length, 1);
        assert.equal(results[0]?.clientIp, '203.0.113.10');
        assert.equal(results[0]?.count, 3);
        assert.deepEqual(results[0]?.domainCounts, [
            { domain: 'api.gdgoc.net', count: 2 },
            { domain: 'shop.gdgoc.net', count: 1 }
        ]);
    });

    it('excludes configured IP addresses from DDoS detection', () => {
        const logs: WebLog[] = [
            createLog(),
            createLog(),
            createLog()
        ];

        const results = detectDdosAttempts(logs, {
            ...baseConfig,
            excludedIps: ['203.0.113.10']
        });

        assert.deepEqual(results, []);
    });
});

describe('DDosJob', () => {
    it('queries recent IIS logs and returns DDoS findings', async () => {
        const requests: unknown[] = [];
        const warnings: unknown[] = [];

        const results = await DDosJob({
            client: {
                transport: {
                    async request(request: unknown) {
                        requests.push(request);

                        return {
                            columns: [
                                { name: '@timestamp' },
                                { name: 'client_ip' },
                                { name: 'domain' }
                            ],
                            values: [
                                ['2026-05-25T00:00:00.000Z', '203.0.113.10', 'api.gdgoc.net'],
                                ['2026-05-25T00:00:01.000Z', '203.0.113.10', 'api.gdgoc.net']
                            ]
                        };
                    }
                }
            },
            windowMinutes: 10,
            requestThreshold: 2,
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

it('buildDdosEsqlQuery fetches recent client IP and domain fields', () => {
    const query = buildDdosEsqlQuery(15);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 15m/);
    assert.match(query, /KEEP @timestamp, client_ip, domain/);
});

function createLog(overrides: Partial<WebLog> = {}): WebLog {
    return {
        timestamp: '2026-05-25T00:00:00.000Z',
        clientIp: '203.0.113.10',
        domain: 'example.com',
        path: '/',
        protocolStatus: 200,
        ...overrides
    };
}
