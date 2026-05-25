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
curl -fsS "http://localhost:9200/iis-*/_search?size=3"
```

Kibana는 `http://localhost:5601`에서 접속한다. Discover에서 `iis-*` data view를 생성하면 Logstash가 적재한 샘플 로그를 확인할 수 있다.

## 앱 환경변수

로컬 ELK를 사용할 때:

```bash
ELASTICSEARCH_URL=http://localhost:9200
ELASTIC_USERNAME=
ELASTIC_PASSWORD=
```

보안이 활성화된 원격 Elasticsearch를 사용할 때:

```bash
ELASTICSEARCH_URL=https://api.gdgoc.net
ELASTIC_USERNAME=<username>
ELASTIC_PASSWORD=<password>
```

`ELASTIC_USERNAME`과 `ELASTIC_PASSWORD`는 둘 다 비우거나 둘 다 설정해야 한다.

## 제외 범위

- reverse proxy, TLS 종료, 도메인 라우팅은 별도 설계에서 다룬다.
- 공개 네트워크 노출, 사용자별 권한 모델, 운영용 인증서 관리는 이번 범위가 아니다.
- 이번 Compose 파일은 로컬 개발과 샘플 로그 적재 검증을 목표로 한다.
