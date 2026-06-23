# Web Log Monitoring Study

IIS 웹 로그가 적재된 외부 Elasticsearch API를 주기적으로 조회하고, 장애 또는 보안 이상 징후가 감지되면 SMTP 메일로 담당자에게 알리는 Node.js + TypeScript 서비스입니다.

## 개발 기준

| 항목 | 내용 |
|------|------|
| 실행 환경 | Native Windows 권장 |
| WSL | 추후 방화벽 CLI 연동을 위해 지원하지 않음 |
| Elasticsearch API | `https://api.gdgoc.net/` |
| 인증 | Basic Auth, 기존 Elastic 계정 정보 사용 |
| 대상 인덱스 | `iis-*` |
| 쿼리 방식 | Elasticsearch ES\|QL `POST /_query` |
| 알림 | SMTP |

## 탐지 시나리오

| 시나리오 | 기준 | 구현 위치 |
|----------|------|-----------|
| 무차별 대입 | login/auth 경로의 동일 IP/domain별 400/401/403 실패 반복 | `src/jobs/brute-force.job/job.ts` |
| DDoS 의심 | 동일 IP의 단시간 과다 접속 | `src/jobs/DDos.job/job.ts` |
| 서비스 장애 | API domain별 HTTP 5xx 응답 비율 급증 | `src/jobs/server-error.job/job.ts` |
| 웹 서비스 에러 | domain별 HTTP 4xx 응답 비율 급증 | `src/jobs/web-error.job/job.ts` |
| 보안 위협 | `.env`, `/admin` 등 민감 경로 접근 시도 | `src/jobs/sensitive-path.job/job.ts` |

## 프로젝트 구조

```text
src/
├── app.ts                         # 폴링 실행 및 알림 전송 흐름
├── config.ts                      # 환경 변수 기반 설정
├── jobs/
│   ├── DDos.job/job.ts            # DDoS 의심 탐지
│   ├── brute-force.job/job.ts     # 무차별 대입 탐지
│   ├── server-error.job/job.ts    # 5xx 장애 탐지
│   ├── web-error.job/job.ts       # 4xx 웹 서비스 에러 탐지
│   ├── sensitive-path.job/job.ts  # 민감 경로 접근 탐지
│   └── mail-notification.job/job.ts # SMTP 알림
└── utils/
    ├── elastic.client.ts          # Elasticsearch 공식 클라이언트
    ├── elastic-query.client.ts    # ES|QL _query 호출
    └── logger.ts                  # ECS 형식 Pino logger
```

## 시작하기

Windows CMD:

```cmd
copy .env.example .env
npm install
npm run dev:win
```

공통 실행:

```bash
npm install
npm run dev
```

검증:

```bash
npm run check
npm test
```

## 환경 변수

| 변수 | 설명 |
|------|------|
| `ELASTICSEARCH_URL` | Elasticsearch API 엔드포인트. 기본값 `https://api.gdgoc.net` |
| `ELASTICSEARCH_INDEX_PATTERN` | 조회 대상 인덱스. 기본값 `iis-*` |
| `ELASTICSEARCH_TIMEOUT_MS` | Elasticsearch 요청 타임아웃(ms) |
| `ELASTIC_USERNAME` | Basic Auth 사용자명 |
| `ELASTIC_PASSWORD` | Basic Auth 비밀번호 |
| `JOBS_POLLING_MINUTES` | 탐지 주기(분) |
| `DETECTION_WINDOW_MINUTES` | 한 번의 탐지에서 조회할 최근 시간 범위(분) |
| `BRUTE_FORCE_MAX_FAILURES` | 무차별 대입 판단용 실패 응답 수 기준 |
| `BRUTE_FORCE_TARGET_PATHS` | 무차별 대입 탐지 대상 경로 키워드 |
| `BRUTE_FORCE_STATUS_CODES` | 무차별 대입 실패 응답 코드 목록 |
| `BRUTE_FORCE_EXCLUDED_IPS` | 무차별 대입 탐지 예외 IP 목록 |
| `DDOS_REQUESTS_PER_IP` | DDoS 의심 IP별 요청 수 기준 |
| `DDOS_EXCLUDED_IPS` | DDoS 탐지 예외 IP 목록 |
| `WEB_ERROR_RATE_PERCENT` | 웹 서비스 에러 판단용 domain별 4xx 응답 비율 기준(%) |
| `SERVER_ERROR_RATE_PERCENT` | 서비스 장애 판단용 API domain별 5xx 응답 비율 기준(%) |
| `EXCLUDED_DOMAINS` | 웹/서버 에러 탐지 예외 domain 목록 |
| `SENSITIVE_PATHS` | 쉼표로 구분한 민감 경로 목록 |
| `SMTP_HOST` | SMTP 서버 호스트 |
| `SMTP_PORT` | SMTP 포트 |
| `SMTP_SECURE` | TLS 직접 연결 여부. 465면 `true`, STARTTLS면 `false` |
| `SMTP_USERNAME` | SMTP 인증 사용자명 |
| `SMTP_PASSWORD` | SMTP 인증 비밀번호 |
| `SMTP_FROM` | 발신자 메일 주소 |
| `SMTP_TO` | 모든 탐지 메일을 받는 superuser 수신자 목록 |
| `SMTP_DOMAIN_RECIPIENTS` | `email:domain1\|domain2;email2:domain3` 형식의 domain별 수신자 목록 |
| `LOG_LEVEL` | 로그 레벨 |

## 참고 문서

- ES\|QL 문법: <https://www.elastic.co/docs/reference/query-languages/esql>
- Elasticsearch Query API: <https://www.elastic.co/docs/api/doc/elasticsearch/group/endpoint-query>
