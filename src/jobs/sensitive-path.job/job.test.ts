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
    it('detects exact and descendant sensitive path access attempts', () => {
        const results = detectSensitivePathAccesses([
            createLog({ path: '/.env' }),
            createLog({ path: '/admin/settings?tab=users' }),
            createLog({ path: '/public' })
        ], baseConfig);

        assert.deepEqual(results.map((result) => ({
            clientIp: result.clientIp,
            path: result.path,
            count: result.count,
            matchedPath: result.matchedPath
        })), [
            {
                clientIp: '203.0.113.10',
                path: '/.env',
                count: 1,
                matchedPath: '/.env'
            },
            {
                clientIp: '203.0.113.10',
                path: '/admin/settings',
                count: 1,
                matchedPath: '/admin'
            }
        ]);
    });

    it('groups repeated sensitive path attempts by client IP and request path', () => {
        const results = detectSensitivePathAccesses([
            createLog({ path: '/admin' }),
            createLog({ path: '/admin' })
        ], baseConfig);

        assert.equal(results.length, 1);
        assert.equal(results[0]?.count, 2);
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
