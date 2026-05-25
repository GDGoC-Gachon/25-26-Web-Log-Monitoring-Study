import { elasticClient } from './elastic.client.ts';
import { logger } from './logger.ts';

export async function elasticUserClient() {
    try {
        return await elasticClient.security.getUser();
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error(
            {
                event: {
                    action: 'elasticsearch-user-query-failed'
                },
                error: {
                    message: errorMessage
                }
            },
            'Elasticsearch user query failed'
        );

        return [];
    }
}
