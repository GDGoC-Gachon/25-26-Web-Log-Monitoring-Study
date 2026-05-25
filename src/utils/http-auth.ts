import type { AxiosRequestConfig } from 'axios';

export function buildBasicAuthConfig(serviceName: string, username?: string, password?: string): Pick<AxiosRequestConfig, 'auth'> {
    if ((username && !password) || (!username && password)) {
        throw new Error(`${serviceName} username and password must be configured together`);
    }

    return username && password ? { auth: { username, password } } : {};
}
