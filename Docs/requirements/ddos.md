# DDoS 의심 탐지 요구사항

대상 코드: `src/jobs/DDos.job/job.ts`

| ID | 요구사항 |
|----|----------|
| REQ-DDOS-001 | 최근 조회 구간의 IIS 로그를 `c_ip` 기준으로 집계해야 한다. |
| REQ-DDOS-002 | IP별 요청 수가 `DDOS_REQUESTS_PER_IP` 이상이면 DDoS 의심으로 판단해야 한다. |
| REQ-DDOS-003 | 탐지 결과에는 IP와 요청 수가 포함되어야 한다. |
