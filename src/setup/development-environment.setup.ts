import dotenv from 'dotenv';
dotenv.config();

import { ensureIisIndexTemplate } from './elasticsearch.setup.ts';
import { ensureIisDataView } from './kibana.setup.ts';

async function setupDevelopmentEnvironment() {
    await ensureIisIndexTemplate();
    await ensureIisDataView();
}

setupDevelopmentEnvironment().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[setup] Development environment setup failed: ${errorMessage}`);
    process.exitCode = 1;
});
