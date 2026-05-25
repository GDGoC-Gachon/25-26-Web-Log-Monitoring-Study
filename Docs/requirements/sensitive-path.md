# 보안 위협 탐지 요구사항

대상 코드: `src/jobs/sensitive-path.job/job.ts`

| ID | 요구사항 |
|----|----------|
| REQ-PATH-001 | 최근 조회 구간에서 민감 경로 접근 시도를 탐지해야 한다. |
| REQ-PATH-002 | 민감 경로 목록은 `SENSITIVE_PATHS` 환경 변수로 관리해야 한다. |
| REQ-PATH-003 | 탐지 결과에는 접근 IP, 요청 경로, 발생 수가 포함되어야 한다. |
