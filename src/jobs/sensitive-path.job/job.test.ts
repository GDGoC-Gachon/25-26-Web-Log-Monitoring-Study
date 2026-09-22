import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildSensitivePathEsqlQuery,
    detectSensitivePathAccesses,
    sensitivePathJob
} from './job.ts';
import type { WebLog } from '../../types/web-log.ts';

const baseConfig = {
    windowMinutes: 5,
    sensitivePaths: ['/.env', '/admin']
};

describe('detectSensitivePathAccesses', () => {
    it('creates one three-path incident with the original request count', () => {
        const results = detectSensitivePathAccesses([
            createLog({ domain: 'elastic.gdgoc.net', clientIp: '34.11.167.212', path: '/.env' }),
            createLog({ domain: 'elastic.gdgoc.net', clientIp: '34.11.167.212', path: '/admin/.env' }),
            createLog({ domain: 'elastic.gdgoc.net', clientIp: '34.11.167.212', path: '/admin/phpinfo.php' }),
            createLog({ path: '/public' })
        ], baseConfig);

        assert.equal(results.length, 1);
        assert.equal(results[0]?.domain, 'elastic.gdgoc.net');
        assert.equal(results[0]?.clientIp, '34.11.167.212');
        assert.equal(results[0]?.count, 3);
        assert.deepEqual(results[0]?.paths, ['/.env', '/admin/.env', '/admin/phpinfo.php']);
        assert.deepEqual(results[0]?.matchedPaths, ['/.env', '/admin']);
    });

    it('groups repeated sensitive path attempts by client IP and request path', () => {
        const results = detectSensitivePathAccesses([
            createLog({ path: '/admin' }),
            createLog({ path: '/admin' })
        ], baseConfig);

        assert.equal(results.length, 1);
        assert.equal(results[0]?.count, 2);
        assert.deepEqual(results[0]?.paths, ['/admin']);
    });

    it('keeps incidents separate when either the domain or client IP differs', () => {
        const results = detectSensitivePathAccesses([
            createLog({ domain: 'elastic.gdgoc.net', clientIp: '34.11.167.212', path: '/.env' }),
            createLog({ domain: 'admin.gdgoc.net', clientIp: '34.11.167.212', path: '/admin/.env' }),
            createLog({ domain: 'elastic.gdgoc.net', clientIp: '34.11.167.213', path: '/admin/phpinfo.php' })
        ], baseConfig);

        assert.equal(results.length, 3);
        assert.deepEqual(results
            .map((result) => [result.domain, result.clientIp, result.paths] as const)
            .sort(([leftDomain, leftIp], [rightDomain, rightIp]) => `${leftDomain}\u0000${leftIp}`.localeCompare(`${rightDomain}\u0000${rightIp}`)), [
            ['admin.gdgoc.net', '34.11.167.212', ['/admin/.env']],
            ['elastic.gdgoc.net', '34.11.167.212', ['/.env']],
            ['elastic.gdgoc.net', '34.11.167.213', ['/admin/phpinfo.php']]
        ]);
    });
});

describe('sensitivePathJob', () => {
    it('queries recent IIS logs and returns sensitive path findings', async () => {
        const warnings: unknown[] = [];
        const results = await sensitivePathJob({
            client: {
                transport: {
                    async request() {
                        return {
                            columns: [
                                { name: '@timestamp' },
                                { name: 'client_ip' },
                                { name: 'path' }
                            ],
                            values: [
                                ['2026-05-25T00:00:00.000Z', '203.0.113.10', '/admin']
                            ]
                        };
                    }
                }
            },
            windowMinutes: 10,
            sensitivePaths: ['/admin'],
            logger: {
                warn(details: unknown) {
                    warnings.push(details);
                }
            }
        });

        assert.equal(results.length, 1);
        assert.equal(results[0]?.windowMinutes, 10);
        assert.equal(warnings.length, 1);
    });
});

it('buildSensitivePathEsqlQuery fetches recent client IP and path fields', () => {
    const query = buildSensitivePathEsqlQuery(15);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 15m/);
    assert.match(query, /KEEP @timestamp, client_ip, path/);
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
