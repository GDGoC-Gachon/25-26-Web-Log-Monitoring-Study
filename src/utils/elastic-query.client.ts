import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import type { WebLog } from '../types/web-log.ts';

interface EsqlColumn {
    name: string;
}

interface EsqlResponse {
    columns?: EsqlColumn[];
    values?: unknown[][];
}

const fallbackColumnNames = ['@timestamp', 'client_ip', 'domain', 'path', 'protocol_status'];

export async function elasticQueryClient(minutes: number): Promise<WebLog[]> {
    const username = process.env.ELASTIC_USERNAME;
    const password = process.env.ELASTIC_PASSWORD;

    if (!username) {
        throw new Error('ELASTIC_USERNAME is required but missing in .env');
    }

    if (!password) {
        throw new Error('ELASTIC_PASSWORD is required but missing in .env');
    }

    try {
        const response = await axios.post(
            'https://api.gdgoc.net/_query',
            {
                query: `FROM iis-* | WHERE @timestamp > NOW() - ${minutes}m | KEEP @timestamp, client_ip, domain, path, protocol_status | SORT @timestamp DESC`
            },
            {
                auth: {
                    username: username,
                    password: password
                },
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (response.status === 200) {
            return parseWebLogs(response.data);
        }
        else {
            throw new Error(`API Request Failed with status code ${response.status}`);
        }
    }
    catch (error) {
        const now = new Date();
        const fileName = path.basename(fileURLToPath(import.meta.url));
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.log(`[${now.toISOString()}] [${fileName}] [ERROR] - ${errorMessage}`);

        return [];
    }
}

function parseWebLogs(data: EsqlResponse): WebLog[] {
    const rows = Array.isArray(data.values) ? data.values : [];
    const columnNames = getColumnNames(data.columns);

    return rows.flatMap((row) => {
        const parsedLog = parseWebLogRow(row, columnNames);
        return parsedLog ? [parsedLog] : [];
    });
}

function getColumnNames(columns: EsqlColumn[] | undefined): string[] {
    if (!Array.isArray(columns) || columns.length === 0) {
        return fallbackColumnNames;
    }

    return columns.map((column) => column.name);
}

function parseWebLogRow(row: unknown[], columnNames: string[]): WebLog | null {
    const timestamp = getStringField(row, columnNames, '@timestamp');
    const clientIp = getStringField(row, columnNames, 'client_ip');
    const domain = getStringField(row, columnNames, 'domain');
    const requestPath = getStringField(row, columnNames, 'path');
    const protocolStatus = getNumberField(row, columnNames, 'protocol_status');

    if (!timestamp || !clientIp || !domain || !requestPath || protocolStatus === null) {
        return null;
    }

    return {
        timestamp,
        clientIp,
        domain,
        path: requestPath,
        protocolStatus
    };
}

function getStringField(row: unknown[], columnNames: string[], fieldName: string): string | null {
    const value = getField(row, columnNames, fieldName);

    if (typeof value === 'string') {
        const trimmedValue = value.trim();
        return trimmedValue.length > 0 ? trimmedValue : null;
    }

    if (typeof value === 'number') {
        return String(value);
    }

    return null;
}

function getNumberField(row: unknown[], columnNames: string[], fieldName: string): number | null {
    const value = getField(row, columnNames, fieldName);

    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsedValue = Number(value);
        return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    return null;
}

function getField(row: unknown[], columnNames: string[], fieldName: string): unknown {
    const columnIndex = columnNames.indexOf(fieldName);
    return columnIndex >= 0 ? row[columnIndex] : undefined;
}
