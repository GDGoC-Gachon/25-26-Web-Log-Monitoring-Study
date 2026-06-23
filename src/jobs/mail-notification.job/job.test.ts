import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildDetectionAlertEmail,
    mailNotification,
    parseDetectionRecipients,
    resolveDetectionRecipients
} from './job.ts';
import type { DetectionAlert, SmtpMessage } from '../../types/detection.ts';

const alerts: DetectionAlert[] = [
    {
        type: 'SENSITIVE_PATH',
        domain: 'shop.gdgoc.net',
        clientIp: '203.0.113.10',
        path: '/admin',
        count: 2,
        reason: 'Sensitive path /admin was accessed 2 times'
    }
];

describe('resolveDetectionRecipients', () => {
    it('sends all alerts to superusers and domain alerts to matching service users', () => {
        const recipients = parseDetectionRecipients(
            'superuser@gdgoc.net',
            'shop-owner@gdgoc.net:shop.gdgoc.net;api-owner@gdgoc.net:api.gdgoc.net'
        );

        assert.deepEqual(resolveDetectionRecipients(alerts, recipients), [
            'superuser@gdgoc.net',
            'shop-owner@gdgoc.net'
        ]);
    });
});

describe('buildDetectionAlertEmail', () => {
    it('includes detection type and reason in the message body', () => {
        const email = buildDetectionAlertEmail(alerts, {
            from: 'monitor@gdgoc.net',
            to: ['superuser@gdgoc.net']
        });

        assert.equal(email.from, 'monitor@gdgoc.net');
        assert.deepEqual(email.to, ['superuser@gdgoc.net']);
        assert.match(email.subject, /Web log monitoring alert/);
        assert.match(email.text, /SENSITIVE_PATH/);
        assert.match(email.text, /Sensitive path \/admin was accessed 2 times/);
    });
});

describe('mailNotification', () => {
    it('does not send SMTP mail when there are no detection alerts', async () => {
        const sent: SmtpMessage[] = [];

        const result = await mailNotification({
            alerts: [],
            smtp: {
                host: 'smtp.gdgoc.net',
                port: 587,
                secure: false,
                from: 'monitor@gdgoc.net',
                recipients: parseDetectionRecipients('superuser@gdgoc.net')
            },
            sendMail: async (message) => {
                sent.push(message);
            }
        });

        assert.deepEqual(result, { sent: false, recipients: [] });
        assert.deepEqual(sent, []);
    });

    it('sends one SMTP message to resolved recipients when alerts exist', async () => {
        const sent: SmtpMessage[] = [];

        const result = await mailNotification({
            alerts,
            smtp: {
                host: 'smtp.gdgoc.net',
                port: 587,
                secure: false,
                from: 'monitor@gdgoc.net',
                recipients: parseDetectionRecipients('superuser@gdgoc.net')
            },
            sendMail: async (message) => {
                sent.push(message);
            }
        });

        assert.deepEqual(result, {
            sent: true,
            recipients: ['superuser@gdgoc.net']
        });
        assert.equal(sent.length, 1);
        assert.equal(sent[0]?.host, 'smtp.gdgoc.net');
        assert.match(sent[0]?.text ?? '', /SENSITIVE_PATH/);
    });

    it('logs SMTP failures without exposing credentials', async () => {
        const errors: unknown[] = [];

        const result = await mailNotification({
            alerts,
            smtp: {
                host: 'smtp.gdgoc.net',
                port: 587,
                secure: false,
                username: 'elastic',
                password: 'secret',
                from: 'monitor@gdgoc.net',
                recipients: parseDetectionRecipients('superuser@gdgoc.net')
            },
            logger: {
                warn() {},
                error(details: unknown) {
                    errors.push(details);
                }
            },
            sendMail: async () => {
                throw new Error('SMTP unavailable');
            }
        });

        assert.deepEqual(result, {
            sent: false,
            recipients: ['superuser@gdgoc.net']
        });
        assert.equal(errors.length, 1);
        assert.doesNotMatch(JSON.stringify(errors[0]), /secret/);
    });
});
