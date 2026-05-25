# Web Log Monitoring Study

IIS 웹 서버 로그를 Elasticsearch API로 폴링하여 이상 징후 감지 시 이메일 알림을 전송하는 Node.js + TypeScript 서비스입니다.

## 개요

| 항목 | 내용 |
|------|------|
| 런타임 | Node.js + TypeScript (ESM) |
| 로그 소스 | IIS 웹 서버 (`iis-*` 인덱스) |
| Elasticsearch 연동 | `@elastic/elasticsearch` 공식 Node.js 클라이언트 |
| 쿼리 엔진 | Elasticsearch ES\|QL (`POST /_query`) |
| 앱 로그 | `pino` + `@elastic/ecs-pino-format` 기반 ECS JSON 로그 |
| 로컬 관측 환경 | Docker Compose 기반 Elasticsearch + Kibana + Logstash |
| 알림 수단 | Resend (이메일) |
| 폴링 주기 | 1분 (`config.jobsPollingMinutes`) |

## 아키텍처

```
src/
├── app.ts                         # 진입점 — setInterval로 모든 잡 실행
├── config.ts                      # 전역 설정 (폴링 주기 등)
├── setup/
│   ├── development-environment.setup.ts # 로컬 Elasticsearch/Kibana 기본 세팅
│   ├── elasticsearch.setup.ts      # IIS 인덱스 템플릿 생성
│   └── kibana.setup.ts             # IIS Kibana data view 생성
├── jobs/
│   ├── brute-force.job/job.ts     # 무차별 대입 로그인 시도 탐지
│   ├── DDos.job/job.ts            # DDoS 패턴 탐지
│   ├── server-error.job/job.ts    # 5xx 서버 오류 모니터링
│   ├── web-error.job/job.ts       # 4xx 웹 오류 모니터링
│   └── mail-notification.job/job.ts # Resend를 통한 이메일 알림 전송
└── utils/
    ├── elastic.client.ts          # 공식 Elasticsearch 클라이언트 생성
    ├── elastic-query.client.ts    # ES|QL _query API로 IIS 로그 조회
    ├── elastic-user.client.ts     # Elasticsearch 사용자 목록 조회
    ├── http-auth.ts               # Kibana axios 호출용 Basic Auth 설정
    └── logger.ts                  # ECS 형식 Pino logger
```

**잡 패턴:** 각 잡은 `src/jobs/<name>.job/job.ts`에 위치하며, 단일 async 함수를 export합니다. 실패 시 빈 배열을 반환하고 예외를 throw하지 않습니다.

**로그 형식:** 앱 로그는 Elastic Common Schema(ECS) 호환 JSON으로 stdout에 출력합니다. Kibana Logs/Discover에서 `event.action`, `service.*`, `error.message` 같은 필드 기준 필터링을 전제로 합니다.

## 시작하기

### 환경 변수 설정

`.env.example`을 복사하여 `.env`를 생성하고 값을 채웁니다.

macOS/Linux:

```bash
cp .env.example .env
```

Windows CMD:

```cmd
copy .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

| 변수 | 설명 |
|------|------|
| `ELASTICSEARCH_URL` | Elasticsearch 엔드포인트. 로컬 기본값은 `http://localhost:9200` |
| `ELASTICSEARCH_TIMEOUT_MS` | Elasticsearch 요청 타임아웃(ms) |
| `ELASTIC_USERNAME` | Elasticsearch Basic Auth 사용자명. 로컬 Compose 환경에서는 비워둔다. |
| `ELASTIC_PASSWORD` | Elasticsearch Basic Auth 비밀번호. 로컬 Compose 환경에서는 비워둔다. |
| `KIBANA_URL` | Kibana 엔드포인트. 로컬 기본값은 `http://localhost:5601` |
| `KIBANA_TIMEOUT_MS` | Kibana 요청 타임아웃(ms) |
| `KIBANA_USERNAME` | Kibana Basic Auth 사용자명. 로컬 Compose 환경에서는 비워둔다. |
| `KIBANA_PASSWORD` | Kibana Basic Auth 비밀번호. 로컬 Compose 환경에서는 비워둔다. |
| `JOBS_POLLING_MINUTES` | 잡 폴링 간격(분) |
| `LOG_LEVEL` | Pino 로그 레벨. 기본값은 `info` |
| `RESEND_TOKEN` | Resend API 이메일 발송 토큰 |

### 로컬 ELK 실행

```bash
docker compose up -d
docker compose ps
curl -fsS http://localhost:9200/_cluster/health
npm run setup:dev
```

`npm run setup:dev`는 `iis-*` 인덱스 템플릿을 Elasticsearch에 등록하고, Kibana에 `IIS Logs` data view를 생성한 뒤 기본 data view로 지정합니다.

Kibana는 `http://localhost:5601`에서 확인합니다. Logstash는 `docker/logstash/sample-logs/iis-sample.log`를 읽어 `iis-*` 인덱스에 샘플 IIS 로그를 적재합니다.

상세 실행 절차와 reverse proxy 제외 범위는 [Docs/elk-local-environment.md](Docs/elk-local-environment.md)를 기준으로 관리합니다.

목표 시스템 다이어그램, 런타임 흐름, 구현해야 할 코드 단위는 [Docs/monitoring-system-development-guide.md](Docs/monitoring-system-development-guide.md)를 기준으로 확인합니다.

### 설치 및 실행

이 프로젝트는 현재 빌드 산출물을 생성하지 않고 `tsx`로 `src/app.ts`를 직접 실행합니다. `tsconfig.json`의 `noEmit: true` 설정 때문에 `dist/app.js`는 생성되지 않습니다.

```bash
# 의존성 설치
npm install

# 공통 개발 실행
npm run dev

# 타입 체크
npm run check

# 단위 테스트
npm test
```

현재 핵심 런타임 의존성은 다음과 같습니다.

```bash
npm install @elastic/elasticsearch dotenv
npm install pino @elastic/ecs-pino-format
```

macOS/Linux 전용 실행:

```bash
npm run dev:unix
```

또는:

```bash
./scripts/dev.sh
```

Windows 전용 실행:

```cmd
npm run dev:win
```

또는:

```cmd
scripts\dev.cmd
```

## 주요 규칙

- ESM 전용 프로젝트 (`"type": "module"`); import 경로에 `.ts` 확장자 사용
- `tsconfig.json`의 `noEmit: true` — `tsx`로 직접 실행, 컴파일 아웃풋 불사용
- `start`는 현재 빌드 정책에 맞춰 `tsx src/app.ts` 기반 공통 실행 진입점으로 연결
- TypeScript 엄격 모드: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 활성화
- 잡은 실패해도 예외를 throw하지 않고 빈 배열 반환

## Elasticsearch 쿼리 예시

```esql
FROM iis-*
| WHERE @timestamp > NOW() - 5m
| KEEP @timestamp, c_ip, cs_method, cs_uri_stem, sc_status, time_taken, cs_user_agent
| SORT @timestamp DESC
```

## 라이선스

이 프로젝트는 학습 목적으로 작성되었습니다.
