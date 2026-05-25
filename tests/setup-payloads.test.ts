import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIisIndexTemplate } from '../src/setup/elasticsearch.setup.ts';
import { buildIisDataView } from '../src/setup/kibana.setup.ts';

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
