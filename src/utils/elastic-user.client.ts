import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

export async function elasticUserClient() {
    const username = process.env.ELASTIC_USERNAME;
    const password = process.env.ELASTIC_PASSWORD;

    if (!username) {
        throw new Error('ELASTIC_USERNAME is required but missing in .env');
    }

    if (!password) {
        throw new Error('ELASTIC_PASSWORD is required but missing in .env');
    }

    try {
        const response = await axios.get(
            'https://api.gdgoc.net/_security/user',
            {
                auth: {
                    username: username,
                    password: password
                },
                timeout: 10000
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