import axios from 'axios';
import { config } from '../config.ts';
import { buildBasicAuthConfig } from '../utils/http-auth.ts';

type KibanaDataViewBody = {
    data_view: {
        id: string;
        title: string;
        name: string;
        timeFieldName: string;
        allowNoIndex: boolean;
    };
    override: boolean;
};

export type IisDataView = {
    id: string;
    body: KibanaDataViewBody;
};

export function buildIisDataView(): IisDataView {
    const id = 'iis-logs';

    return {
        id,
        body: {
            data_view: {
                id,
                title: 'iis-*',
                name: 'IIS Logs',
                timeFieldName: '@timestamp',
                allowNoIndex: true
            },
            override: true
        }
    };
}

export async function ensureIisDataView() {
    const dataView = buildIisDataView();
    const kibanaUrl = config.kibana.url.replace(/\/$/, '');
    const authConfig = buildBasicAuthConfig(
        'KIBANA',
        config.kibana.username,
        config.kibana.password
    );
    const requestConfig = {
        headers: {
            'Content-Type': 'application/json',
            'kbn-xsrf': 'true'
        },
        ...authConfig,
        timeout: config.kibana.requestTimeoutMs
    };

    await axios.post(
        `${kibanaUrl}/api/data_views/data_view`,
        dataView.body,
        requestConfig
    );

    await axios.post(
        `${kibanaUrl}/api/data_views/default`,
        {
            data_view_id: dataView.id,
            force: true
        },
        requestConfig
    );

    console.log(`[setup] Kibana data view '${dataView.id}' is ready and set as default`);
}
