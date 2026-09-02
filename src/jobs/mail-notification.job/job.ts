import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import tls from 'node:tls';

import { config } from '../../config.ts';
import type {
    DetectionAlert,
    DetectionLogger,
    DetectionRecipient,
    DetectionType,
    SmtpMessage
} from '../../types/detection.ts';
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
    recipients: DetectionRecipient[];
};

type MailNotificationOptions = {
    alerts?: DetectionAlert[];
    smtp?: MailNotificationSmtpConfig;
    logger?: DetectionLogger;
    sendMail?: (message: SmtpMessage) => Promise<void>;
};

type MailNotificationResult = {
    sent: boolean;
    recipients: string[];
};

type SmtpSocket = net.Socket | tls.TLSSocket;

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
            '#TargetPath#': displayValue(alert.path),
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
    sendMail = sendSmtpMessage
}: MailNotificationOptions = {}): Promise<MailNotificationResult> {
    if (alerts.length === 0) {
        return {
            sent: false,
            recipients: []
        };
    }

    const recipients = resolveDetectionRecipients(alerts, smtp.recipients);

    if (!smtp.host || !smtp.from || smtp.recipients.length === 0) {
        logger.warn({
            event: 'mail_notification_skipped',
            reason: 'SMTP host, sender, or recipients are not configured',
            alertCount: alerts.length,
            recipientCount: recipients.length
        });

        return {
            sent: false,
            recipients
        };
    }

    const notifiedRecipients = new Set<string>();
    let sentCount = 0;
    let hadFailure = false;

    for (const alert of alerts) {
        const alertRecipients = resolveDetectionRecipients([alert], smtp.recipients);

        for (const recipient of alertRecipients) {
            notifiedRecipients.add(recipient);
        }

        if (alertRecipients.length === 0) {
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
                to: alertRecipients
            });
        } catch (error) {
            hadFailure = true;
            logMailError(logger, {
                event: 'mail_notification_template_failed',
                message: error instanceof Error ? error.message : 'Unknown mail template failure',
                alertType: alert.type,
                recipientCount: alertRecipients.length
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
                ...email
            });
            sentCount += 1;
        } catch (error) {
            hadFailure = true;
            logMailError(logger, {
                event: 'mail_notification_failed',
                message: error instanceof Error ? error.message : 'Unknown SMTP failure',
                alertType: alert.type,
                recipientCount: alertRecipients.length
            });
        }
    }

    return {
        sent: sentCount > 0 && !hadFailure,
        recipients: Array.from(notifiedRecipients)
    };
}

export function parseDetectionRecipients(
    superuserRecipients: string | undefined = '',
    domainRecipients: string | undefined = ''
): DetectionRecipient[] {
    const superusers = splitCsv(superuserRecipients).map((email) => ({
        email,
        scope: 'all' as const
    }));

    const serviceUsers = domainRecipients
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const [email = '', domains = ''] = entry.split(':');

            return {
                email: email.trim(),
                scope: 'domains' as const,
                domains: domains.split(/[|,]/).map((domain) => domain.trim()).filter(Boolean)
            };
        })
        .filter((recipient) => recipient.email.length > 0 && recipient.domains.length > 0);

    return [...superusers, ...serviceUsers];
}

export function resolveDetectionRecipients(
    alerts: DetectionAlert[],
    recipients: DetectionRecipient[]
): string[] {
    const recipientEmails: string[] = [];

    for (const recipient of recipients) {
        if (recipient.scope === 'all') {
            recipientEmails.push(recipient.email);
            continue;
        }

        const recipientDomains = new Set(recipient.domains);
        const shouldReceive = alerts.some((alert) => getAlertDomains(alert).some((domain) => recipientDomains.has(domain)));

        if (shouldReceive) {
            recipientEmails.push(recipient.email);
        }
    }

    return Array.from(new Set(recipientEmails));
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
        const ehloResponse = await writeSmtpCommand(socket, 'EHLO web-log-monitoring', [250]);

        if (!message.secure && hasSmtpCapability(ehloResponse, 'STARTTLS')) {
            await writeSmtpCommand(socket, 'STARTTLS', [220]);
            socket = await upgradeToTls(socket, message.host);
            await writeSmtpCommand(socket, 'EHLO web-log-monitoring', [250]);
        }

        if (message.username && message.password) {
            await writeSmtpCommand(socket, buildPlainAuthCommand(message.username, message.password), [235]);
        }

        await writeSmtpCommand(socket, `MAIL FROM:<${message.from}>`, [250]);

        for (const recipient of message.to) {
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
        from: config.smtp.from,
        recipients: parseDetectionRecipients(config.smtp.to, config.smtp.domainRecipients)
    };
}

function splitCsv(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function getAlertDomains(alert: DetectionAlert): string[] {
    return [
        ...(alert.domain ? [alert.domain] : []),
        ...(alert.domainCounts?.map(({ domain }) => domain) ?? [])
    ];
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
        alert.path ? `path=${alert.path}` : undefined,
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

function buildPlainAuthCommand(username: string, password: string): string {
    return `AUTH PLAIN ${Buffer.from(`\u0000${username}\u0000${password}`).toString('base64')}`;
}

export function formatSmtpData(message: SmtpMessage): string {
    const headers = [
        `From: ${message.from}`,
        `To: ${message.to.join(', ')}`,
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
