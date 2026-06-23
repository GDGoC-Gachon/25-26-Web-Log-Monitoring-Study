# 서버 에러 탐지 요구사항

대상 코드: `src/jobs/server-error.job/job.ts`

| ID | 요구사항 |
|----|----------|
| REQ-5XX-001 | 최근 n분 로그를 기준으로 탐지를 수행해야 한다. |
| REQ-5XX-002 | API domain 별 전체 로그 수를 계산해야 한다. |
| REQ-5XX-003 | HTTP 5xx 응답 수를 집계해야 한다. |
| REQ-5XX-004 | 5xx 응답 비율이 `SERVER_ERROR_RATE_PERCENT` 이상이면 서버 에러 급증으로 판단해야 한다. |
| REQ-5XX-005 | 예외 domain 목록을 n개 이상 등록할 수 있어야 한다. |
| REQ-5XX-006 | 예외 domain은 탐지 대상에서 제외해야 한다. |
