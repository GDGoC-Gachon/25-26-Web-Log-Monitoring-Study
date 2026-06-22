import pino from 'pino';
import { ecsFormat } from '@elastic/ecs-pino-format';

export const logger = pino({
    ...ecsFormat({
        serviceName: 'web-log-monitoring-study',
        eventDataset: 'web-log-monitoring-study'
    }),
    level: process.env.LOG_LEVEL ?? 'info'
});
