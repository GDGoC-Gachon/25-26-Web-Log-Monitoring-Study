# 로컬 ELK 개발 환경

이 문서는 Docker Compose 기반 Elasticsearch, Kibana, Logstash 개발 환경을 정의한다. reverse proxy 설계와 외부 공개 배포는 이번 범위에서 제외한다.

## 서비스 구성

| 서비스 | 용도 | 로컬 주소 |
| --- | --- | --- |
| Elasticsearch | `iis-*` 인덱스 저장 및 ES\|QL 조회 | `http://localhost:9200` |
| Kibana | 로컬 인덱스 확인과 Discover 사용 | `http://localhost:5601` |
| Logstash | 샘플 IIS 로그를 `iis-YYYY.MM.dd` 인덱스로 적재 | 내부 서비스 |

포트는 모두 `127.0.0.1`에만 바인딩한다. 현재 Compose 구성은 학습/개발 편의를 위해 `xpack.security.enabled=false`로 실행한다. 원격 또는 공유 환경에서는 이 설정을 사용하지 않는다.

## 실행

```bash
docker compose up -d
docker compose ps
curl -fsS http://localhost:9200/_cluster/health
npm run setup:dev
curl -fsS "http://localhost:9200/iis-*/_search?size=3"
```

Kibana는 `http://localhost:5601`에서 접속한다. `npm run setup:dev`는 다음 기본 개발환경 세팅을 TypeScript 코드로 수행한다.

- Elasticsearch `iis-logs-template` index template 생성
- Kibana `IIS Logs` data view 생성 (`iis-*`, time field `@timestamp`)
- `IIS Logs` data view를 Kibana 기본 data view로 지정

이후 Discover에서 Logstash가 적재한 샘플 로그를 바로 확인할 수 있다.

## Kibana Fleet / Integrations 콘솔 로그

현재 로컬 Compose 구성은 IIS 로그를 Logstash로 적재하고 Kibana Discover에서 `iis-*` 인덱스를 확인하는 범위까지를 목표로 한다. Fleet 또는 Integrations 기반 Agent 관리는 이번 로컬 환경의 필수 경로가 아니다.

Kibana 화면에서 다음 계열의 로그가 보일 수 있다.

```text
/api/fleet/settings 403 Forbidden
/api/fleet/agents/setup 403 Forbidden
/api/fleet/epm/packages 403 Forbidden
/api/fleet/epm/categories 403 Forbidden
```

원인은 로컬 Elasticsearch를 `xpack.security.enabled=false`로 실행하는 동안 Kibana 8.15.3의 Fleet / Integrations 플러그인이 보안 기능을 전제로 한 내부 API를 호출하기 때문이다. `/api/fleet/settings` 응답 본문은 다음 형태다.

```json
{"statusCode":403,"error":"Forbidden","message":"Kibana security must be enabled to use Fleet"}
```

Compose의 Kibana 서비스는 프로젝트 범위 밖인 Agent 관리 호출을 줄이기 위해 `XPACK_FLEET_AGENTS_ENABLED=false`를 설정한다. 다만 Kibana 8.15.3에서는 Fleet 플러그인 자체가 계속 로드되므로 `/api/fleet/settings`, `/api/fleet/epm/*` 403을 모두 제거하려면 Elasticsearch/Kibana 보안을 활성화하고 Fleet 권한까지 구성해야 한다. 현재 로컬 환경은 no-auth Discover 검증을 우선하므로 그 경로는 사용하지 않는다.

로컬 검증에서는 아래 항목이 정상인지 우선 확인한다.

```bash
curl -fsS http://localhost:9200/_cluster/health
curl -fsS "http://localhost:9200/iis-*/_search?size=3"
curl -fsS http://localhost:5601/api/status
```

위 확인이 통과하고 Discover에서 `iis-*` data view가 조회되면, `/api/fleet/* 403`은 현재 프로젝트의 IIS 로그 수집 경로를 막는 오류가 아니다. Fleet 또는 Integrations 기능을 별도로 사용할 때만 Kibana Role에서 Fleet / Integrations 권한과 Elasticsearch API key 관련 권한을 설계한다.

## 앱 환경변수

로컬 ELK를 사용할 때:

```bash
ELASTICSEARCH_URL=http://localhost:9200
ELASTIC_USERNAME=
ELASTIC_PASSWORD=
KIBANA_URL=http://localhost:5601
KIBANA_USERNAME=
KIBANA_PASSWORD=
```

보안이 활성화된 원격 Elasticsearch를 사용할 때:

```bash
ELASTICSEARCH_URL=https://api.gdgoc.net
ELASTIC_USERNAME=<username>
ELASTIC_PASSWORD=<password>
KIBANA_URL=<kibana-url>
KIBANA_USERNAME=<username>
KIBANA_PASSWORD=<password>
```

`ELASTIC_USERNAME`과 `ELASTIC_PASSWORD`는 둘 다 비우거나 둘 다 설정해야 한다.
`KIBANA_USERNAME`과 `KIBANA_PASSWORD`도 둘 다 비우거나 둘 다 설정해야 한다.

## 제외 범위

- reverse proxy, TLS 종료, 도메인 라우팅은 별도 설계에서 다룬다.
- 공개 네트워크 노출, 사용자별 권한 모델, 운영용 인증서 관리는 이번 범위가 아니다.
- 이번 Compose 파일은 로컬 개발과 샘플 로그 적재 검증을 목표로 한다.
