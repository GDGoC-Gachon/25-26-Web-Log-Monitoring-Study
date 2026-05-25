import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { config } from '../config.ts';

export async function elasticUserClient() {
    const username = config.elasticsearch.username;
    const password = config.elasticsearch.password;
    const elasticsearchUrl = config.elasticsearch.url.replace(/\/$/, '');

    if ((username && !password) || (!username && password)) {
        throw new Error('ELASTIC_USERNAME and ELASTIC_PASSWORD must be configured together');
    }

    try {
        const response = await axios.get(
            `${elasticsearchUrl}/_security/user`,
            {
                ...(username && password ? { auth: { username, password } } : {}),
                timeout: config.elasticsearch.requestTimeoutMs
            }
        );

        if (response.status === 200) {
            return response.data;
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
