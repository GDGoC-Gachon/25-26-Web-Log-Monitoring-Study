# 요구사항 정의

공지사항 기준으로 현재 개발 범위를 재정리한다. 로컬 Docker/ELK 구성, Kibana data view, Logstash 샘플 적재는 현재 범위에서 제외한다.

## 범위

| 영역 | 요구사항 | 문서 | 구현 |
|------|----------|------|------|
| 공통 플랫폼 | 외부 Elasticsearch API Basic Auth 호출, 환경 변수 관리 | [common-platform.md](requirements/common-platform.md) | `src/config.ts`, `src/utils/elastic.client.ts` |
| 무차별 대입 탐지 | 아이디/패스워드 무차별 대입 공격 탐지 | [brute-force.md](requirements/brute-force.md) | `src/jobs/brute-force.job/job.ts` |
| DDoS 탐지 | 동일 IP 단시간 과다 접속 탐지 | [ddos.md](requirements/ddos.md) | `src/jobs/DDos.job/job.ts` |
| 웹 서비스 에러 탐지 | HTTP 4xx 응답 빈도 급증 탐지 | [web-error.md](requirements/web-error.md) | `src/jobs/web-error.job/job.ts` |
| 서버 에러 탐지 | HTTP 5xx 응답 빈도 급증 탐지 | [server-error.md](requirements/server-error.md) | `src/jobs/server-error.job/job.ts` |
| 보안 위협 | 민감 경로 접근 시도 탐지 | [sensitive-path.md](requirements/sensitive-path.md) | `src/jobs/sensitive-path.job/job.ts` |
| 메일 알림 | SMTP 기반 즉시 알림 | [mail-notification.md](requirements/mail-notification.md) | `src/jobs/mail-notification.job/job.ts` |

## 제외 항목

- Docker Compose 기반 로컬 Elasticsearch/Kibana/Logstash
- WSL 실행 가이드
- Kibana 설정 자동화
- Resend API
- IIS 샘플 로그 로컬 적재
