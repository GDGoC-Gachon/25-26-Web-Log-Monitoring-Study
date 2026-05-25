import { elasticClient } from '../utils/elastic.client.ts';
import { logger } from '../utils/logger.ts';

type FieldMapping = {
    type: string;
    fields?: Record<string, FieldMapping>;
};

type IndexTemplateBody = {
    index_patterns: string[];
    priority: number;
    template: {
        settings: {
            number_of_shards: number;
            number_of_replicas: number;
        };
        mappings: {
            dynamic: boolean;
            properties: Record<string, FieldMapping>;
        };
    };
    _meta: {
        description: string;
        managed_by: string;
    };
};

export type IisIndexTemplate = {
    name: string;
    body: IndexTemplateBody;
};

export function buildIisIndexTemplate(): IisIndexTemplate {
    return {
        name: 'iis-logs-template',
        body: {
            index_patterns: ['iis-*'],
            priority: 500,
            template: {
                settings: {
                    number_of_shards: 1,
                    number_of_replicas: 0
                },
                mappings: {
                    dynamic: true,
                    properties: {
                        '@timestamp': { type: 'date' },
                        message: { type: 'text' },
                        s_ip: { type: 'ip' },
                        c_ip: { type: 'ip' },
                        cs_method: { type: 'keyword' },
                        cs_uri_stem: { type: 'keyword' },
                        cs_uri_query: { type: 'keyword' },
                        s_port: { type: 'integer' },
                        cs_username: { type: 'keyword' },
                        cs_user_agent: {
                            type: 'keyword',
                            fields: {
                                text: { type: 'match_only_text' }
                            }
                        },
                        sc_status: { type: 'integer' },
                        sc_substatus: { type: 'integer' },
                        sc_win32_status: { type: 'integer' },
                        time_taken: { type: 'integer' },
                        'event.dataset': { type: 'keyword' },
                        'service.name': { type: 'keyword' }
                    }
                }
            },
            _meta: {
                description: 'IIS access log index template for local ELK development',
                managed_by: 'web-log-monitoring-study'
            }
        }
    };
}

export async function ensureIisIndexTemplate() {
    const template = buildIisIndexTemplate();

    await elasticClient.transport.request({
        method: 'PUT',
        path: `/_index_template/${template.name}`,
        body: template.body
    });

    logger.info(
        {
            event: {
                action: 'iis-index-template-ready'
            },
            elasticsearch: {
                index_template: template.name
            }
        }
    );
}
