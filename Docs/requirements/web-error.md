# 웹 서비스 에러 탐지 요구사항

대상 코드: `src/jobs/web-error.job/job.ts`

| ID | 요구사항 |
|----|----------|
| REQ-4xx-001 | 최근 n분 로그를 기준으로 탐지를 수행해야 한다. |
| REQ-4xx-002 | domain 별 전체 로그 수를 계산해야 한다. |
| REQ-4xx-003 | HTTP 4xx 응답 수를 집계해야 한다. |
| REQ-4xx-004 | 4xx 응답 비율이 `WEB_ERROR_RATE_PERCENT` 이상이면 웹 서비스 에러 급증으로 판단해야 한다. |
| REQ-4xx-005 | 예외 domain 목록을 n개 이상 등록할 수 있어야 한다. |
| REQ-4xx-006 | 예외 domain은 탐지 대상에서 제외해야 한다. |
