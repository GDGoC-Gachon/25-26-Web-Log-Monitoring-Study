# DDoS 의심 탐지 요구사항

대상 코드: `src/jobs/DDos.job/job.ts`

| ID | 요구사항 |
|----|----------|
| REQ-DDOS-001 | 최근 n분 로그를 기준으로 탐지를 수행해야 한다. |
| REQ-DDOS-002 | 동일 client_ip 기준 요청 수를 계산해야 한다. |
| REQ-DDOS-003 | 동일 domain 기준 요청 수를 계산해야 한다. |
| REQ-DDOS-004 | 요청 수가 `DDOS_REQUESTS_PER_IP` 이상인 경우 악성 client_ip로 판단해야 한다. |
| REQ-DDOS-005 | 예외 IP를 n개 이상 등록할 수 있어야 한다. |
| REQ-DDOS-006 | 예외 IP는 탐지 대상에서 제외해야 한다. |
