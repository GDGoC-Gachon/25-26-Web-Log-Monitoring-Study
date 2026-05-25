import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectBruteForceAttempts } from './job.ts';
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
