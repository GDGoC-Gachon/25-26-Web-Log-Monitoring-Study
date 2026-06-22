# 무차별 대입 탐지 요구사항

대상 코드: `src/jobs/brute-force.job/job.ts`

| ID | 요구사항 |
|----|----------|
| REQ-BRUTE-001 | 최근 n분 로그를 기준으로 탐지를 수행해야 한다. |
| REQ-BRUTE-002 | Path에 login, auth 키워드가 포함된 로그를 대상으로 해야 한다. |
| REQ-BRUTE-003 | 동일 client_ip, domain 기준 400, 401, 403 응답 수를 집계해야 한다. |
| REQ-BRUTE-004 | 실패 응답 수가 `BRUTE_FORCE_MAX_FAILURES` 이상이면 무차별 대입 공격으로 판단해야 한다. |
| REQ-BRUTE-005 | 예외 IP를 n개 이상 등록할 수 있어야 한다. |
| REQ-BRUTE-006 | 예외 IP는 탐지 대상에서 제외해야 한다. |
