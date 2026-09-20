import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildDetectionAlertEmail,
    buildTemplatedDetectionAlertEmail,
    formatSmtpData,
    mailNotification,
    resolveElasticRoleRecipients
} from './job.ts';
import type { DetectionAlert, SmtpMessage } from '../../types/detection.ts';
import type { ElasticUserApiClient } from '../../utils/elastic-user.client.ts';

const bruteForceAlert: DetectionAlert = {
    type: 'BRUTE_FORCE',
    domain: 'shop.gdgoc.net',
    clientIp: '203.0.113.10',
    count: 31,
    reason: 'Login failures exceeded the threshold'
};

const ddosAlert: DetectionAlert = {
    type: 'DDOS',
    clientIp: '203.0.113.11',
    count: 20,
    domainCounts: [
        { domain: 'api.gdgoc.net', count: 12 },
        { domain: 'shop.gdgoc.net', count: 8 }
    ],
    reason: 'Request volume exceeded the threshold'
};

const serverErrorAlert: DetectionAlert = {
    type: 'SERVER_ERROR',
    domain: 'api.gdgoc.net',
    errorRatePercent: 25.5,
    reason: '5xx error rate exceeded the threshold'
};

const sensitivePathAlert: DetectionAlert = {
    type: 'SENSITIVE_PATH',
    domain: 'shop.gdgoc.net',
    clientIp: '203.0.113.12',
    path: '/.env',
    count: 2,
    reason: 'A sensitive path was accessed'
};

const webErrorAlert: DetectionAlert = {
    type: 'WEB_ERROR',
    domain: 'api.gdgoc.net',
    errorRatePercent: 12.5,
    reason: '4xx error rate exceeded the threshold'
};

const templateAlerts = [
    bruteForceAlert,
    ddosAlert,
    serverErrorAlert,
    sensitivePathAlert,
    webErrorAlert
];

const smtpConfig = {
    host: 'smtp.gdgoc.net',
    port: 587,
    secure: false,
    from: 'monitor@gdgoc.net'
};

const notificationUsers = {
    'superuser@gdgoc.net': {
        email: 'superuser@gdgoc.net',
        enabled: true,
        roles: ['superuser']
    },
    'shop-owner@gdgoc.net': {
        email: 'shop-owner@gdgoc.net',
        enabled: true,
        roles: ['shop.gdgoc.net']
    },
    'api-owner@gdgoc.net': {
        email: 'api-owner@gdgoc.net',
        enabled: true,
        roles: ['api.gdgoc.net']
    }
};

function createElasticUserClient(users: unknown = notificationUsers): ElasticUserApiClient {
    return {
        transport: {
            async request() {
                return { body: users };
            }
        }
    };
}

describe('resolveElasticRoleRecipients', () => {
    it('uses exact domain roles for To and superuser roles for envelope BCC', () => {
        const recipients = resolveElasticRoleRecipients(ddosAlert, [
            { email: 'superuser@gdgoc.net', roles: ['superuser', 'shop.gdgoc.net'] },
            { email: 'shop-owner@gdgoc.net', roles: ['shop.gdgoc.net'] },
            { email: 'api-owner@gdgoc.net', roles: ['api.gdgoc.net'] },
            { email: 'near-match@gdgoc.net', roles: ['api.gdgoc.net.evil'] }
        ]);

        assert.deepEqual(recipients, {
            to: ['shop-owner@gdgoc.net', 'api-owner@gdgoc.net'],
            bcc: ['superuser@gdgoc.net']
        });
    });
});

describe('detection alert emails', () => {
    it('keeps the plain-text summary as the HTML mail fallback', () => {
        const email = buildDetectionAlertEmail([sensitivePathAlert], {
            from: 'monitor@gdgoc.net',
            to: ['superuser@gdgoc.net']
        });

        assert.equal(email.from, 'monitor@gdgoc.net');
        assert.deepEqual(email.to, ['superuser@gdgoc.net']);
        assert.match(email.subject, /Web log monitoring alert/);
        assert.match(email.text, /SENSITIVE_PATH/);
        assert.match(email.text, /A sensitive path was accessed/);
    });

    it('renders each detection type with its dedicated template', async () => {
        const expectations = [
            {
                alert: bruteForceAlert,
                subject: '무차별 대입 공격 탐지',
                values: ['shop.gdgoc.net', '203.0.113.10', '31']
            },
            {
                alert: ddosAlert,
                subject: 'DDoS 공격 탐지',
                values: ['api.gdgoc.net (12), shop.gdgoc.net (8)', '203.0.113.11', '20']
            },
            {
                alert: serverErrorAlert,
                subject: '서버 5xx 응답 급증 탐지',
                values: ['api.gdgoc.net', '25.5']
            },
            {
                alert: sensitivePathAlert,
                subject: '민감 경로 접근 탐지',
                values: ['shop.gdgoc.net', '203.0.113.12', '/.env', '2']
            },
            {
                alert: webErrorAlert,
                subject: '웹 서비스 4xx 응답 급증 탐지',
                values: ['api.gdgoc.net', '12.5']
            }
        ];

        for (const expectation of expectations) {
            const email = await buildTemplatedDetectionAlertEmail(expectation.alert, {
                from: 'monitor@gdgoc.net',
                to: ['superuser@gdgoc.net']
            });

            assert.match(email.subject, new RegExp(expectation.subject));
            const html = email.html ?? '';
            assert.ok(html);
            for (const value of expectation.values) {
                assert.ok(html.includes(value));
            }
            assert.doesNotMatch(html, /#[A-Za-z]+#/);
        }
    });

    it('escapes dynamic values before putting them in an HTML template', async () => {
        const email = await buildTemplatedDetectionAlertEmail({
            type: 'SENSITIVE_PATH',
            domain: '<script>alert("domain")</script>',
            clientIp: '203.0.113.13',
            path: '/admin?<img src=x onerror=alert(1)>',
            count: 1,
            reason: 'Sensitive path was accessed'
        }, {
            from: 'monitor@gdgoc.net',
            to: ['superuser@gdgoc.net']
        });

        assert.ok(email.html?.includes('&lt;script&gt;alert(&quot;domain&quot;)&lt;/script&gt;'));
        assert.ok(email.html?.includes('/admin?&lt;img src=x onerror=alert(1)&gt;'));
        assert.doesNotMatch(email.html ?? '', /<script>alert/);
    });
});

describe('mailNotification', () => {
    it('does not send SMTP mail when there are no detection alerts', async () => {
        const sent: SmtpMessage[] = [];
        const infos: unknown[] = [];

        const result = await mailNotification({
            alerts: [],
            smtp: smtpConfig,
            logger: {
                warn() {},
                info(details: unknown) {
                    infos.push(details);
                }
            },
            sendMail: async (message) => {
                sent.push(message);
            }
        });

        assert.deepEqual(result, { sent: false, recipients: [] });
        assert.deepEqual(sent, []);
        assert.deepEqual(infos, [{
            event: 'mail_notification_skipped',
            reason: 'No detection alerts',
            alertCount: 0,
            recipientCount: 0
        }]);
    });

    it('sends one templated SMTP message for every detection alert', async () => {
        const sent: SmtpMessage[] = [];
        const infos: unknown[] = [];

        const result = await mailNotification({
            alerts: templateAlerts,
            smtp: smtpConfig,
            userClient: createElasticUserClient(),
            logger: {
                warn() {},
                info(details: unknown) {
                    infos.push(details);
                }
            },
            sendMail: async (message) => {
                sent.push(message);
            }
        });

        assert.deepEqual(result, {
            sent: true,
            recipients: ['shop-owner@gdgoc.net', 'superuser@gdgoc.net', 'api-owner@gdgoc.net']
        });
        assert.equal(sent.length, 5);
        assert.deepEqual(sent.map((message) => message.subject), [
            '[GDGoc Gachon 보안관제] 무차별 대입 공격 탐지',
            '[GDGoc Gachon 보안관제] DDoS 공격 탐지',
            '[GDGoc Gachon 보안관제] 서버 5xx 응답 급증 탐지',
            '[GDGoc Gachon 보안관제] 민감 경로 접근 탐지',
            '[GDGoc Gachon 보안관제] 웹 서비스 4xx 응답 급증 탐지'
        ]);
        assert.ok(sent.every((message) => message.html));
        assert.deepEqual(
            infos.map((entry) => (entry as { event: string }).event),
            ['mail_notification_sent', 'mail_notification_sent', 'mail_notification_sent', 'mail_notification_sent', 'mail_notification_sent']
        );
    });

    it('uses one Elastic user lookup, exact role routing, and a headerless envelope BCC', async () => {
        const sent: SmtpMessage[] = [];
        const requests: unknown[] = [];
        const userClient: ElasticUserApiClient = {
            transport: {
                async request(request) {
                    requests.push(request);
                    return {
                        body: {
                            'admin@gdgoc.net': { email: 'admin@gdgoc.net', enabled: true, roles: ['superuser'] },
                            'elastic-owner@gdgoc.net': { email: 'elastic-owner@gdgoc.net', enabled: true, roles: ['elastic.gdgoc.net'] },
                            'disabled@gdgoc.net': { email: 'disabled@gdgoc.net', enabled: false, roles: ['elastic.gdgoc.net'] },
                            'invalid@gdgoc.net': { email: 'not-an-email', enabled: true, roles: ['elastic.gdgoc.net'] },
                            'near-match@gdgoc.net': { email: 'near-match@gdgoc.net', enabled: true, roles: ['elastic.gdgoc.net.example'] }
                        }
                    };
                }
            }
        };
        const alert: DetectionAlert = {
            type: 'SENSITIVE_PATH',
            domain: 'elastic.gdgoc.net',
            clientIp: '34.11.167.212',
            path: '/.env',
            paths: ['/.env', '/admin/.env', '/admin/phpinfo.php'],
            count: 3,
            reason: 'Grouped sensitive path incident'
        };

        const result = await mailNotification({
            alerts: [alert],
            smtp: smtpConfig,
            userClient,
            logger: { warn() {} },
            sendMail: async (message) => {
                sent.push(message);
            }
        });

        assert.deepEqual(result, {
            sent: true,
            recipients: ['elastic-owner@gdgoc.net', 'admin@gdgoc.net']
        });
        assert.equal(requests.length, 1);
        assert.deepEqual(requests[0], { method: 'GET', path: '/_security/user' });
        assert.equal(sent.length, 1);
        assert.deepEqual(sent[0]?.to, ['elastic-owner@gdgoc.net']);
        assert.deepEqual(sent[0]?.bcc, ['admin@gdgoc.net']);
        assert.match(sent[0]?.html ?? '', /\/.env, \/admin\/\.env, \/admin\/phpinfo\.php/);
        assert.doesNotMatch(formatSmtpData(sent[0]!), /^Bcc:/mi);
    });

    it('holds all SMTP delivery when the Elastic user lookup fails without logging its error', async () => {
        const errors: unknown[] = [];

        const result = await mailNotification({
            alerts: [bruteForceAlert],
            smtp: smtpConfig,
            userClient: {
                transport: {
                    async request() {
                        throw new Error('Elastic request timed out with password=must-not-log');
                    }
                }
            },
            logger: {
                warn() {},
                error(details: unknown) {
                    errors.push(details);
                }
            },
            sendMail: async () => {
                assert.fail('sendMail should not run after an Elastic user lookup failure');
            }
        });

        assert.deepEqual(result, { sent: false, recipients: [] });
        assert.deepEqual(errors, [{
            event: 'mail_notification_user_lookup_failed',
            reason: 'Elastic user lookup failed; SMTP delivery held',
            alertCount: 1
        }]);
        assert.doesNotMatch(JSON.stringify(errors), /password|must-not-log/i);
    });

    it('continues sending later alerts when an SMTP send fails', async () => {
        const sent: SmtpMessage[] = [];
        const errors: unknown[] = [];
        let attempts = 0;

        const result = await mailNotification({
            alerts: [bruteForceAlert, serverErrorAlert],
            smtp: smtpConfig,
            userClient: createElasticUserClient(),
            logger: {
                warn() {},
                error(details: unknown) {
                    errors.push(details);
                }
            },
            sendMail: async (message) => {
                attempts += 1;
                if (attempts === 1) {
                    throw new Error('SMTP unavailable');
                }
                sent.push(message);
            }
        });

        assert.deepEqual(result, {
            sent: false,
            recipients: ['shop-owner@gdgoc.net', 'superuser@gdgoc.net', 'api-owner@gdgoc.net']
        });
        assert.equal(attempts, 2);
        assert.equal(sent.length, 1);
        assert.equal(errors.length, 1);
        assert.doesNotMatch(JSON.stringify(errors[0]), /password|secret/i);
    });

    it('skips sending when SMTP configuration is incomplete', async () => {
        const warnings: unknown[] = [];

        const result = await mailNotification({
            alerts: [bruteForceAlert],
            smtp: {
                ...smtpConfig,
                host: undefined
            },
            logger: {
                warn(details: unknown) {
                    warnings.push(details);
                }
            },
            sendMail: async () => {
                assert.fail('sendMail should not be called without an SMTP host');
            }
        });

        assert.deepEqual(result, {
            sent: false,
            recipients: []
        });
        assert.equal(warnings.length, 1);
    });
});

describe('formatSmtpData', () => {
    it('serializes HTML mail as multipart alternative with a text fallback', () => {
        const data = formatSmtpData({
            host: 'smtp.gdgoc.net',
            port: 587,
            secure: false,
            from: 'monitor@gdgoc.net',
            to: ['superuser@gdgoc.net'],
            subject: 'Detection alert',
            text: 'Plain-text fallback',
            html: '<strong>HTML alert</strong>'
        });

        assert.match(data, /Content-Type: multipart\/alternative; boundary="web-log-monitoring-/);
        assert.match(data, /Content-Type: text\/plain; charset=utf-8/);
        assert.match(data, /Content-Type: text\/html; charset=utf-8/);
        assert.match(data, /Plain-text fallback/);
        assert.match(data, /<strong>HTML alert<\/strong>/);

        const koreanSubjectData = formatSmtpData({
            host: 'smtp.gdgoc.net',
            port: 587,
            secure: false,
            from: 'monitor@gdgoc.net',
            to: ['superuser@gdgoc.net'],
            subject: '[GDGoc Gachon 보안관제] DDoS 공격 탐지',
            text: 'Plain-text fallback'
        });

        assert.match(koreanSubjectData, /Subject: =\?UTF-8\?B\?.+\?=/);

        const plainTextData = formatSmtpData({
            host: 'smtp.gdgoc.net',
            port: 587,
            secure: false,
            from: 'monitor@gdgoc.net',
            to: ['superuser@gdgoc.net'],
            subject: 'Plain-text alert',
            text: 'Plain-text only'
        });

        assert.match(plainTextData, /Content-Type: text\/plain; charset=utf-8/);
        assert.doesNotMatch(plainTextData, /multipart\/alternative/);
    });
});
