import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIisIndexTemplate } from '../src/setup/elasticsearch.setup.ts';
import { buildIisDataView } from '../src/setup/kibana.setup.ts';
import { buildElasticsearchClientOptions } from '../src/utils/elastic.client.ts';
import { buildRecentIisLogsEsqlQuery, buildRecentIisLogsQueryRequest } from '../src/utils/elastic-query.client.ts';
import { logger } from '../src/utils/logger.ts';

function assertFieldType(properties: Record<string, { type: string }>, fieldName: string, expectedType: string) {
    const field = properties[fieldName];

    assert.ok(field, `${fieldName} mapping should exist`);
    assert.equal(field.type, expectedType);
}

test('buildIisIndexTemplate defines the IIS index pattern and required field mappings', () => {
    const template = buildIisIndexTemplate();
    const properties = template.body.template.mappings.properties;

    assert.equal(template.name, 'iis-logs-template');
    assert.deepEqual(template.body.index_patterns, ['iis-*']);
    assertFieldType(properties, '@timestamp', 'date');
    assertFieldType(properties, 'c_ip', 'ip');
    assertFieldType(properties, 's_ip', 'ip');
    assertFieldType(properties, 'sc_status', 'integer');
    assertFieldType(properties, 'time_taken', 'integer');
});

test('buildIisDataView creates the default Kibana data view for IIS logs', () => {
    const dataView = buildIisDataView();

    assert.equal(dataView.id, 'iis-logs');
    assert.equal(dataView.body.data_view.title, 'iis-*');
    assert.equal(dataView.body.data_view.name, 'IIS Logs');
    assert.equal(dataView.body.data_view.timeFieldName, '@timestamp');
});

test('buildElasticsearchClientOptions builds official client options with optional basic auth', () => {
    assert.deepEqual(
        buildElasticsearchClientOptions({
            url: 'https://api.gdgoc.net/',
            requestTimeoutMs: 5000
        }),
        {
            node: 'https://api.gdgoc.net',
            requestTimeout: 5000
        }
    );

    assert.deepEqual(
        buildElasticsearchClientOptions({
            url: 'https://api.gdgoc.net/',
            username: 'elastic',
            password: 'secret',
            requestTimeoutMs: 5000
        }),
        {
            node: 'https://api.gdgoc.net',
            auth: {
                username: 'elastic',
                password: 'secret'
            },
            requestTimeout: 5000
        }
    );

    assert.throws(
        () => buildElasticsearchClientOptions({
            url: 'https://api.gdgoc.net',
            username: 'elastic',
            requestTimeoutMs: 5000
        }),
        /ELASTICSEARCH username and password must be configured together/
    );
});

test('buildRecentIisLogsQueryRequest creates the ES|QL _query request for the current IIS mapping', () => {
    const query = buildRecentIisLogsEsqlQuery(15);
    const request = buildRecentIisLogsQueryRequest(15);

    assert.match(query, /FROM iis-\*/);
    assert.match(query, /@timestamp > NOW\(\) - 15m/);
    assert.match(query, /KEEP @timestamp, c_ip, cs_method, cs_uri_stem, sc_status, time_taken, cs_user_agent/);
    assert.deepEqual(request, {
        method: 'POST',
        path: '/_query',
        querystring: {
            format: 'json'
        },
        body: {
            query
        }
    });
});

test('logger exposes an ECS-aware pino logger', () => {
    assert.equal(typeof logger.info, 'function');
    assert.equal(logger.level, process.env.LOG_LEVEL ?? 'info');
});
