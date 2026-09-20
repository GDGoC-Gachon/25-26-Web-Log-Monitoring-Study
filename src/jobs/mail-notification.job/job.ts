import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import tls from 'node:tls';

import { config } from '../../config.ts';
import type {
    DetectionAlert,
    DetectionLogger,
    DetectionType,
    SmtpMessage
} from '../../types/detection.ts';
import {
    elasticUserClient,
    fetchElasticNotificationUsers,
    type ElasticNotificationUser,
    type ElasticUserApiClient
} from '../../utils/elastic-user.client.ts';
import { logger as defaultLogger } from '../../utils/logger.ts';

type EmailContent = Pick<SmtpMessage, 'from' | 'to' | 'subject' | 'text' | 'html'>;

type MailTemplate = {
    fileName: string;
    subject: string;
    placeholders: (alert: DetectionAlert) => Record<string, string>;
};

type MailNotificationSmtpConfig = {
    host?: string | undefined;
    port: number;
    secure: boolean;
    username?: string | undefined;
    password?: string | undefined;
    from?: string | undefined;
};

type MailNotificationOptions = {
    alerts?: DetectionAlert[];
    smtp?: MailNotificationSmtpConfig;
    logger?: DetectionLogger;
    sendMail?: (message: SmtpMessage) => Promise<void>;
    userClient?: ElasticUserApiClient;
};

type MailNotificationResult = {
    sent: boolean;
    recipients: string[];
};

type SmtpSocket = net.Socket | tls.TLSSocket;

type AlertRecipients = {
    to: string[];
    bcc: string[];
};

const mailFormDirectory = new URL('../../mailForm/', import.meta.url);
const templateContents = new Map<string, Promise<string>>();

const mailTemplates: Record<DetectionType, MailTemplate> = {
    BRUTE_FORCE: {
        fileName: 'security-monitoring-brute-force-login-attack-detection.html',
        subject: '[GDGoc Gachon 보안관제] 무차별 대입 공격 탐지',
        placeholders: (alert) => ({
            '#TargetDomain#': displayValue(alert.domain),
            '#AttackerIp#': displayValue(alert.clientIp),
            '#AttackCount#': displayNumber(alert.count)
        })
    },
    DDOS: {
        fileName: 'security-monitoring-ddos-attack-detection.html',
        subject: '[GDGoc Gachon 보안관제] DDoS 공격 탐지',
        placeholders: (alert) => ({
            '#TargetDomain#': formatDdosDomains(alert),
            '#AttackerIp#': displayValue(alert.clientIp),
            '#AttackCount#': displayNumber(alert.count)
        })
    },
    SERVER_ERROR: {
        fileName: 'security-monitoring-server-response-error-spike-detection.html',
        subject: '[GDGoc Gachon 보안관제] 서버 5xx 응답 급증 탐지',
        placeholders: (alert) => ({
            '#TargetDomain#': displayValue(alert.domain),
            '#ErrorPercent#': displayNumber(alert.errorRatePercent)
        })
    },
    SENSITIVE_PATH: {
        fileName: 'security-monitoring-sensitive-path-access-detection.html',
        subject: '[GDGoc Gachon 보안관제] 민감 경로 접근 탐지',
        placeholders: (alert) => ({
            '#TargetDomain#': displayValue(alert.domain),
            '#AttackerIp#': displayValue(alert.clientIp),
            '#TargetPath#': formatSensitivePaths(alert),
            '#AccessCount#': displayNumber(alert.count)
        })
    },
    WEB_ERROR: {
        fileName: 'security-monitoring-web-service-response-error-spike-detection.html',
        subject: '[GDGoc Gachon 보안관제] 웹 서비스 4xx 응답 급증 탐지',
        placeholders: (alert) => ({
            '#TargetDomain#': displayValue(alert.domain),
            '#ErrorPercent#': displayNumber(alert.errorRatePercent)
        })
    }
};

export async function mailNotification({
    alerts = [],
    smtp = getDefaultSmtpConfig(),
    logger = defaultLogger,
    sendMail = sendSmtpMessage,
    userClient = elasticUserClient
}: MailNotificationOptions = {}): Promise<MailNotificationResult> {
    if (alerts.length === 0) {
        logger.info?.({
            event: 'mail_notification_skipped',
            reason: 'No detection alerts',
            alertCount: 0,
            recipientCount: 0
        });

        return {
            sent: false,
            recipients: []
        };
    }

    if (!smtp.host || !smtp.from) {
        logger.warn({
            event: 'mail_notification_skipped',
            reason: 'SMTP host or sender is not configured',
            alertCount: alerts.length,
            recipientCount: 0
        });

        return {
            sent: false,
            recipients: []
        };
    }

    let users: ElasticNotificationUser[];
    try {
        users = await fetchElasticNotificationUsers(userClient);
    } catch {
        logMailError(logger, {
            event: 'mail_notification_user_lookup_failed',
            reason: 'Elastic user lookup failed; SMTP delivery held',
            alertCount: alerts.length
        });

        return {
            sent: false,
            recipients: []
        };
    }

    const notifiedRecipients = new Set<string>();
    let sentCount = 0;
    let hadFailure = false;

    for (const alert of alerts) {
        const alertRecipients = resolveElasticRoleRecipients(alert, users);

        for (const recipient of [...alertRecipients.to, ...alertRecipients.bcc]) {
            notifiedRecipients.add(recipient);
        }

        if (alertRecipients.to.length === 0 && alertRecipients.bcc.length === 0) {
            logger.warn({
                event: 'mail_notification_skipped',
                reason: 'No recipients match the detection alert',
                alertType: alert.type,
                recipientCount: 0
            });
            continue;
        }

        let email: EmailContent;

        try {
            email = await buildTemplatedDetectionAlertEmail(alert, {
                from: smtp.from,
                to: alertRecipients.to
            });
        } catch (error) {
            hadFailure = true;
            logMailError(logger, {
                event: 'mail_notification_template_failed',
                message: error instanceof Error ? error.message : 'Unknown mail template failure',
                alertType: alert.type,
                recipientCount: alertRecipients.to.length + alertRecipients.bcc.length
            });
            continue;
        }

        try {
            await sendMail({
                host: smtp.host,
                port: smtp.port,
                secure: smtp.secure,
                username: smtp.username,
                password: smtp.password,
                bcc: alertRecipients.bcc,
                ...email
            });
            sentCount += 1;
            logger.info?.({
                event: 'mail_notification_sent',
                alertType: alert.type,
                recipientCount: alertRecipients.to.length + alertRecipients.bcc.length,
                toRecipientCount: alertRecipients.to.length,
                bccRecipientCount: alertRecipients.bcc.length
            });
        } catch (error) {
            hadFailure = true;
            logMailError(logger, {
                event: 'mail_notification_failed',
                message: error instanceof Error ? error.message : 'Unknown SMTP failure',
                alertType: alert.type,
                recipientCount: alertRecipients.to.length + alertRecipients.bcc.length
            });
        }
    }

    return {
        sent: sentCount > 0 && !hadFailure,
        recipients: Array.from(notifiedRecipients)
    };
}

export function buildDetectionAlertEmail(
    alerts: DetectionAlert[],
    emailOptions: Pick<EmailContent, 'from' | 'to'>
): EmailContent {
    return {
        ...emailOptions,
        subject: `[Web log monitoring alert] ${alerts.length} detection(s)`,
        text: [
            'Web log monitoring detected the following alert(s):',
            '',
            ...alerts.map(formatDetectionAlert)
        ].join('\n')
    };
}

export async function buildTemplatedDetectionAlertEmail(
    alert: DetectionAlert,
    emailOptions: Pick<EmailContent, 'from' | 'to'>
): Promise<EmailContent> {
    const template = mailTemplates[alert.type];
    const templateContent = await loadMailTemplate(template.fileName);

    return {
        ...buildDetectionAlertEmail([alert], emailOptions),
        subject: template.subject,
        html: replaceTemplatePlaceholders(templateContent, template.placeholders(alert))
    };
}

export async function sendSmtpMessage(message: SmtpMessage): Promise<void> {
    let socket = await connectSmtpSocket(message);

    try {
        await readSmtpResponse(socket, [220]);
        let ehloResponse = await writeSmtpCommand(socket, 'EHLO web-log-monitoring', [250]);

        if (!message.secure && hasSmtpCapability(ehloResponse, 'STARTTLS')) {
            await writeSmtpCommand(socket, 'STARTTLS', [220]);
            socket = await upgradeToTls(socket, message.host);
            ehloResponse = await writeSmtpCommand(socket, 'EHLO web-log-monitoring', [250]);
        }

        if (message.username || message.password) {
            await authenticateSmtp(socket, ehloResponse, message.username, message.password);
        }

        await writeSmtpCommand(socket, `MAIL FROM:<${message.from}>`, [250]);

        for (const recipient of smtpEnvelopeRecipients(message)) {
            await writeSmtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
        }

        await writeSmtpCommand(socket, 'DATA', [354]);
        socket.write(`${formatSmtpData(message)}\r\n.\r\n`);
        await readSmtpResponse(socket, [250]);
        await writeSmtpCommand(socket, 'QUIT', [221]);
    } finally {
        socket.end();
    }
}

function getDefaultSmtpConfig(): MailNotificationSmtpConfig {
    return {
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        username: config.smtp.username,
        password: config.smtp.password,
        from: config.smtp.from
    };
}

function getAlertDomains(alert: DetectionAlert): string[] {
    return [
        ...(alert.domain ? [alert.domain] : []),
        ...(alert.domainCounts?.map(({ domain }) => domain) ?? [])
    ];
}

export function resolveElasticRoleRecipients(
    alert: DetectionAlert,
    users: ElasticNotificationUser[]
): AlertRecipients {
    const bcc = uniqueEmails(users
        .filter((user) => user.roles.includes('superuser'))
        .map((user) => user.email));
    const bccSet = new Set(bcc);
    const alertDomains = new Set(getAlertDomains(alert));
    const to = uniqueEmails(users
        .filter((user) => !bccSet.has(user.email))
        .filter((user) => user.roles.some((role) => alertDomains.has(role)))
        .map((user) => user.email));

    return { to, bcc };
}

function uniqueEmails(emails: string[]): string[] {
    return Array.from(new Set(emails));
}

function displayValue(value: string | undefined): string {
    return value && value.length > 0 ? value : '알 수 없음';
}

function displayNumber(value: number | undefined): string {
    return typeof value === 'number' ? String(value) : '알 수 없음';
}

function formatDdosDomains(alert: DetectionAlert): string {
    const domainCounts = alert.domainCounts ?? [];

    if (domainCounts.length === 0) {
        return displayValue(alert.domain);
    }

    return domainCounts.map(({ domain, count }) => `${domain} (${count})`).join(', ');
}

function formatSensitivePaths(alert: DetectionAlert): string {
    if (alert.paths && alert.paths.length > 0) {
        return alert.paths.join(', ');
    }

    return displayValue(alert.path);
}

function loadMailTemplate(fileName: string): Promise<string> {
    const existingTemplate = templateContents.get(fileName);

    if (existingTemplate) {
        return existingTemplate;
    }

    const template = readFile(new URL(fileName, mailFormDirectory), 'utf8');
    templateContents.set(fileName, template);

    return template;
}

function replaceTemplatePlaceholders(template: string, placeholders: Record<string, string>): string {
    return Object.entries(placeholders).reduce(
        (renderedTemplate, [placeholder, value]) => renderedTemplate.split(placeholder).join(escapeHtml(value)),
        template
    );
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDetectionAlert(alert: DetectionAlert): string {
    const details = [
        alert.domain ? `domain=${alert.domain}` : undefined,
        alert.clientIp ? `clientIp=${alert.clientIp}` : undefined,
        alert.path || alert.paths ? `path=${formatSensitivePaths(alert)}` : undefined,
        typeof alert.count === 'number' ? `count=${alert.count}` : undefined,
        typeof alert.threshold === 'number' ? `threshold=${alert.threshold}` : undefined,
        typeof alert.errorRatePercent === 'number' ? `errorRatePercent=${alert.errorRatePercent}` : undefined
    ].filter(Boolean);

    return `- ${alert.type}: ${alert.reason}${details.length > 0 ? ` (${details.join(', ')})` : ''}`;
}

function logMailError(logger: DetectionLogger, details: unknown): void {
    if (logger.error) {
        logger.error(details);
        return;
    }

    logger.warn(details);
}

function connectSmtpSocket(message: SmtpMessage): Promise<SmtpSocket> {
    return new Promise((resolve, reject) => {
        const socket = message.secure
            ? tls.connect({ host: message.host, port: message.port, servername: message.host })
            : net.connect({ host: message.host, port: message.port });
        const connectEvent = message.secure ? 'secureConnect' : 'connect';

        socket.setTimeout(30000);
        socket.once(connectEvent, () => {
            socket.setEncoding('utf8');
            resolve(socket);
        });
        socket.once('error', reject);
        socket.once('timeout', () => {
            socket.destroy(new Error('SMTP connection timed out'));
        });
    });
}

function upgradeToTls(socket: SmtpSocket, host: string): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
        const tlsSocket = tls.connect({ socket, servername: host });

        tlsSocket.once('secureConnect', () => {
            tlsSocket.setEncoding('utf8');
            resolve(tlsSocket);
        });
        tlsSocket.once('error', reject);
    });
}

function readSmtpResponse(socket: SmtpSocket, expectedCodes: number[]): Promise<string[]> {
    return new Promise((resolve, reject) => {
        let response = '';

        const cleanup = () => {
            socket.off('data', onData);
            socket.off('error', onError);
            socket.off('close', onClose);
        };
        const onData = (chunk: Buffer | string) => {
            response += chunk.toString();
            const lines = response.split(/\r?\n/).filter(Boolean);
            const lastLine = lines.at(-1);

            if (!lastLine || !/^\d{3} /.test(lastLine)) {
                return;
            }

            cleanup();
            const code = Number(lastLine.slice(0, 3));

            if (!expectedCodes.includes(code)) {
                reject(new Error(`SMTP command failed with code ${code}`));
                return;
            }

            resolve(lines);
        };
        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };
        const onClose = () => {
            cleanup();
            reject(new Error('SMTP connection closed before response'));
        };

        socket.on('data', onData);
        socket.once('error', onError);
        socket.once('close', onClose);
    });
}

async function writeSmtpCommand(socket: SmtpSocket, command: string, expectedCodes: number[]): Promise<string[]> {
    socket.write(`${command}\r\n`);

    return readSmtpResponse(socket, expectedCodes);
}

function hasSmtpCapability(response: string[], capability: string): boolean {
    return response.some((line) => line.toUpperCase().includes(capability));
}

async function authenticateSmtp(
    socket: SmtpSocket,
    ehloResponse: string[],
    username: string | undefined,
    password: string | undefined
): Promise<void> {
    if (!username || !password) {
        throw new Error('SMTP username and password must be configured together');
    }

    if (hasSmtpAuthMechanism(ehloResponse, 'PLAIN')) {
        await writeSmtpCommand(socket, buildPlainAuthCommand(username, password), [235]);
        return;
    }

    if (hasSmtpAuthMechanism(ehloResponse, 'LOGIN')) {
        await writeSmtpCommand(socket, 'AUTH LOGIN', [334]);
        await writeSmtpCommand(socket, Buffer.from(username, 'utf8').toString('base64'), [334]);
        await writeSmtpCommand(socket, Buffer.from(password, 'utf8').toString('base64'), [235]);
        return;
    }

    throw new Error('SMTP server does not advertise AUTH PLAIN or AUTH LOGIN');
}

function hasSmtpAuthMechanism(response: string[], mechanism: 'PLAIN' | 'LOGIN'): boolean {
    return response.some((line) => {
        const authDeclaration = line.match(/^\d{3}(?:-|\s)+AUTH(?:=|\s)+(.+)$/i)?.[1];

        return authDeclaration?.split(/\s+/).some((item) => item.toUpperCase() === mechanism) ?? false;
    });
}

function buildPlainAuthCommand(username: string, password: string): string {
    return `AUTH PLAIN ${Buffer.from(`\u0000${username}\u0000${password}`).toString('base64')}`;
}

export function formatSmtpData(message: SmtpMessage): string {
    const headers = [
        `From: ${message.from}`,
        `To: ${message.to.length > 0 ? message.to.join(', ') : 'undisclosed-recipients:;'}`,
        `Subject: ${encodeMimeHeader(message.subject)}`
    ];

    if (!message.html) {
        return [
            ...headers,
            'Content-Type: text/plain; charset=utf-8',
            '',
            escapeSmtpData(message.text)
        ].join('\r\n');
    }

    const boundary = `web-log-monitoring-${randomUUID()}`;

    return [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        escapeSmtpData(message.text),
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        escapeSmtpData(message.html),
        `--${boundary}--`
    ].join('\r\n');
}

function smtpEnvelopeRecipients(message: SmtpMessage): string[] {
    return uniqueEmails([...message.to, ...(message.bcc ?? [])]);
}

function escapeSmtpData(text: string): string {
    return text
        .replace(/\r?\n/g, '\r\n')
        .split('\r\n')
        .map((line) => (line.startsWith('.') ? `.${line}` : line))
        .join('\r\n');
}

function encodeMimeHeader(value: string): string {
    return /[^\x20-\x7e]/.test(value)
        ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
        : value;
}
