# 서비스 장애 탐지 요구사항

대상 코드: `src/jobs/server-error.job/job.ts`

| ID | 요구사항 |
|----|----------|
| REQ-5XX-001 | 최근 조회 구간에서 `sc_status >= 500 AND sc_status < 600`인 로그를 집계해야 한다. |
| REQ-5XX-002 | 5xx 응답 수가 `SERVER_ERROR_COUNT` 이상이면 서비스 장애로 판단해야 한다. |
| REQ-5XX-003 | 탐지 결과에는 5xx 응답 수가 포함되어야 한다. |
