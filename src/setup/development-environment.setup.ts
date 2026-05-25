import dotenv from 'dotenv';
dotenv.config();

import { ensureIisIndexTemplate } from './elasticsearch.setup.ts';
import { ensureIisDataView } from './kibana.setup.ts';
import { logger } from '../utils/logger.ts';

async function setupDevelopmentEnvironment() {
    await ensureIisIndexTemplate();
    await ensureIisDataView();
}

setupDevelopmentEnvironment().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
        {
            event: {
                action: 'development-environment-setup-failed'
            },
            error: {
                message: errorMessage
            }
        },
        'Development environment setup failed'
    );
    process.exitCode = 1;
});
