# Web Log Monitoring Study

IIS 웹 로그가 적재된 외부 Elasticsearch API를 주기적으로 조회하고, 장애 또는 보안 이상 징후가 감지되면 다음 정상 폴링에서 SMTP 메일로 담당자에게 알리는 Node.js + TypeScript 서비스입니다.

## 개발 기준

| 항목 | 내용 |
|------|------|
| 실행 환경 | Native Windows 권장 |
| WSL | 현재 지원하지 않음. 방화벽 연동 방식 확정 후 실행 환경 재검토 |
| Elasticsearch API | `https://api.gdgoc.net/` |
| 인증 | Basic Auth, 기존 Elastic 계정 정보 사용 |
| 대상 인덱스 | `iis-*` |
| 쿼리 방식 | Elasticsearch ES\|QL `POST /_query` |
| 알림 | SMTP |

## 개발 단계

| 단계 | 범위 | 상태 |
|------|------|------|
| 1차 | 외부 Elastic 조회, 탐지 5종, SMTP 알림 | 부분 구현 |
| 1.1 | 오류율 트래픽 하한선(구현), 다중 도메인 수신 범위 격리, HTML 메일, Elastic 사용자 연동, 중복·부분 장애 처리 | 부분 구현 |
| 2차 | 탐지 IP의 방화벽 등록·해제·감사 | 계획 |
| 2차 검토 | 로그인, 서버 IP·도메인 등록, 권한별 대시보드 | 검토 중 |

2026-07-06 시연에서 탐지와 메일 수신은 확인했지만, 다중 도메인 알림 혼재와 인증 4xx 중복 가능성이 제기되었습니다. 2026-07-11 추가 피드백에서는 저트래픽 오류율 오탐, 메일 가독성, Elastic role 기반 수신자 분리가 요청되었습니다. 현재 범위와 미결정 사항은 [모니터링 시스템 통합 스펙](Docs/monitoring-system-specification.md)을 기준으로 합니다.

2026-07-13에는 4xx·5xx 오류율 트래픽 하한선을 구현했습니다. 집계 키별 요청 수가 최소 요청 수(기본값 20) 이상이고 오류율 임계값도 충족할 때만 탐지하며, 같은 공통 정책을 탐지 Job과 최종 alert 변환에 모두 적용합니다. 이 항목의 자동 테스트는 통과했지만 외부 Elasticsearch·SMTP를 사용한 실서버 QA와 나머지 1.1 범위는 아직 완료되지 않았습니다.

## 탐지 시나리오

| 시나리오 | 기준 | 구현 위치 |
|----------|------|-----------|
| 무차별 대입 | login/auth 경로의 동일 IP/domain별 400/401/403 실패 반복 | `src/jobs/brute-force.job/job.ts` |
| DDoS 의심 | 동일 IP의 단시간 과다 접속 | `src/jobs/DDos.job/job.ts` |
| 서비스 장애 | API 경로의 `apiDomain`별 요청 수가 최소값(기본 20) 이상이고 HTTP 5xx 비율이 기준(기본 5%) 이상 | `src/jobs/server-error.job/job.ts` |
| 웹 서비스 에러 | `hostDomain`별 요청 수가 최소값(기본 20) 이상이고 HTTP 4xx 비율이 기준(기본 10%) 이상 | `src/jobs/web-error.job/job.ts` |
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
    ├── domain-error-detection.ts  # 4xx/5xx 공통 탐지·최종 alert 변환 정책
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

`GAP-008`은 2026-07-13 타입 검사와 자동 테스트 38건 통과를 기준으로 구현 완료 처리했습니다. 이 결과는 로컬 자동 검증이며 외부 Elasticsearch·SMTP 실서버 QA를 대체하지 않습니다.

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
| `WEB_ERROR_RATE_PERCENT` | 웹 서비스 에러 판단용 `hostDomain`별 4xx 응답 비율 기준(%) |
| `WEB_ERROR_MIN_REQUESTS` | 4xx 오류율을 적용할 `hostDomain`별 최소 요청 수. 기본값 `20` |
| `SERVER_ERROR_RATE_PERCENT` | 서비스 장애 판단용 `apiDomain`별 5xx 응답 비율 기준(%) |
| `SERVER_ERROR_MIN_REQUESTS` | 5xx 오류율을 적용할 `apiDomain`별 최소 요청 수. 기본값 `20` |
| `EXCLUDED_DOMAINS` | 웹 오류의 host domain과 서버 오류의 API 경로 domain이 현재 공유하는 예외 목록. 추후 분리 필요 |
| `SENSITIVE_PATHS` | 쉼표로 구분한 민감 경로 목록 |
| `SMTP_HOST` | SMTP 서버 호스트 |
| `SMTP_PORT` | SMTP 포트 |
| `SMTP_SECURE` | TLS 직접 연결 여부. 465면 `true`, STARTTLS면 `false` |
| `SMTP_USERNAME` | SMTP 인증 사용자명 |
| `SMTP_PASSWORD` | SMTP 인증 비밀번호 |
| `SMTP_FROM` | 발신자 메일 주소 |
| `SMTP_TO` | 모든 탐지 메일을 받는 superuser 수신자 목록 |
| `SMTP_DOMAIN_RECIPIENTS` | `email:domain1\|domain2;email2:domain3` 형식의 현재 정적 domain별 수신자 목록 |
| `LOG_LEVEL` | 로그 레벨 |

`WEB_ERROR_MIN_REQUESTS`와 `SERVER_ERROR_MIN_REQUESTS`는 서로 독립적으로 설정하며, 생략하면 각각 `20`을 사용합니다. 두 변수는 코드와 `.env.example`에 반영되어 있습니다.

## 참고 문서

- [모니터링 시스템 통합 스펙](Docs/monitoring-system-specification.md)
- [요구사항 대시보드](Docs/requirements-definition.md)
- [2026-07-11 오류 및 기능개선 사항 반영 기록](Docs/feedback/2026-07-11-error-and-feature-improvements.md)
- [탐지·알림 회귀 QA 계획](Docs/test-plans/2026-07-06-detection-regression.md)
- [후속 개발 계획](Docs/PLANS.md)
- ES\|QL 문법: <https://www.elastic.co/docs/reference/query-languages/esql>
- Elasticsearch Query API: <https://www.elastic.co/docs/api/doc/elasticsearch/group/endpoint-query>
