export type DetectionLogger = {
    warn(details: unknown): void;
    error?(details: unknown): void;
};

export type DomainErrorFinding = {
    domain: string;
    totalRequests: number;
    errorCount: number;
    errorRatePercent: number;
};

export type DetectionType =
    | 'BRUTE_FORCE'
    | 'DDOS'
    | 'SERVER_ERROR'
    | 'SENSITIVE_PATH'
    | 'WEB_ERROR';

export type DetectionAlert = {
    type: DetectionType;
    reason: string;
    domain?: string;
    clientIp?: string;
    path?: string;
    count?: number;
    threshold?: number;
    windowMinutes?: number;
    totalRequests?: number;
    errorCount?: number;
    errorRatePercent?: number;
};

export type DetectionRecipient =
    | {
        email: string;
        scope: 'all';
    }
    | {
        email: string;
        scope: 'domains';
        domains: string[];
    };

export type SmtpMessage = {
    host: string;
    port: number;
    secure: boolean;
    username?: string | undefined;
    password?: string | undefined;
    from: string;
    to: string[];
    subject: string;
    text: string;
};
