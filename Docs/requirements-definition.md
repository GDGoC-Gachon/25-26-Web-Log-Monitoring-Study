# 요구사항 대시보드

| 항목 | 내용 |
|------|------|
| 기준일 | 2026-07-13 |
| 기준 회의 | [2026-07-06 모니터링 시스템 회의](meeting-notes/2026-07-06-monitoring-system.md) |
| 추가 자료 | [2026-07-11 오류 및 기능개선 사항](feedback/2026-07-11-error-and-feature-improvements.md) |
| 상위 스펙 | [모니터링 시스템 통합 스펙](monitoring-system-specification.md) |

이 문서는 요구사항의 단계, 상태, 우선순위, 구현 위치를 빠르게 확인하는 대시보드다. 로컬 Docker/ELK 구성, Kibana data view, Logstash 샘플 적재는 현재 범위에서 제외한다.

## 상태

`구현됨` / `부분 구현` / `QA 필요` / `계획` / `검토 중` / `결정 대기`를 사용한다.

## 요구사항 현황

| 영역 | ID 범위 | 단계 | 상태 | 우선순위 | 상세 문서 | 구현·검증 |
|------|---------|------|------|----------|-----------|-----------|
| 공통 플랫폼 | `REQ-001~005` | 1차 | QA 필요 | P0 | [common-platform.md](requirements/common-platform.md) | `src/config.ts`, `src/utils/elastic*.ts` |
| 무차별 대입 탐지 | `REQ-BRUTE-001~007` | 1차 | QA 필요 | P0 | [brute-force.md](requirements/brute-force.md) | `src/jobs/brute-force.job/` |
| DDoS 탐지 | `REQ-DDOS-001~008` | 1차 | 부분 구현 | P0 | [ddos.md](requirements/ddos.md) | `src/jobs/DDos.job/` |
| 웹 서비스 오류 탐지 | `REQ-4XX-001~008` | 1차·1.1 | 부분 구현 | P0 | [web-error.md](requirements/web-error.md) | Job·공통 정책·자동 테스트 구현, 실서버 QA 필요 |
| 서버 오류 탐지 | `REQ-5XX-001~008` | 1차·1.1 | 부분 구현 | P0 | [server-error.md](requirements/server-error.md) | Job·공통 정책·자동 테스트 구현, 실서버 QA 필요 |
| 민감 경로 접근 탐지 | `REQ-PATH-001~005` | 1차 | 부분 구현 | P0 | [sensitive-path.md](requirements/sensitive-path.md) | `src/jobs/sensitive-path.job/` |
| 메일 알림 | `REQ-MAIL-001~013` | 1차·1.1 | 부분 구현 | P0 | [mail-notification.md](requirements/mail-notification.md) | `src/jobs/mail-notification.job/` |
| 알림 수명주기·부분 장애 | `REQ-ALERT-001~007` | 1.1 | 계획 | P0 | [alert-lifecycle.md](requirements/alert-lifecycle.md) | 미구현, QA 계획 있음 |
| Elastic 유저 API | `REQ-EUSER-001~008` | 1.1 | 결정 대기 | P1 | [elastic-user-api.md](requirements/elastic-user-api.md) | 미구현, 후보 API 계약 검증 필요 |
| 방화벽 대응 | `REQ-FW-001~009` | 2차 | 계획 | P1 | [firewall-response.md](requirements/firewall-response.md) | 미구현 |
| SaaS 관제 웹 | `REQ-SAAS-001~010` | 2차 검토 | 검토 중 | P2 | [security-monitoring-saas.md](requirements/security-monitoring-saas.md) | 미구현 |

## 2026-07-06 회의 반영 사항

- 현재 구현 범위는 탐지와 메일 알림까지다.
- 다중 도메인 브루트포스·메일 혼재, 브루트포스와 4xx 중복, DDoS 도메인 표시를 P0 회귀 QA 대상으로 등록한다.
- Elastic 유저 API와 메일 표현 형식 개선을 후속 요구사항으로 분리한다.
- 방화벽 등록 자동화는 2차 개발 방향으로 관리한다.
- 인증, 서버 IP·도메인 등록, 권한별 대시보드는 3~4주 검토 범위의 SaaS 제안으로 관리하며 확정 구현 범위로 오해하지 않는다.

## 2026-07-11 오류·기능개선 사항 반영

- 4xx·5xx는 최소 요청 수를 충족한 집계에만 오류율 임계값을 적용하는 P0 요구사항을 추가했다. 당시 결정 대기였던 기본값과 설정 계약은 2026-07-13 확정했다.
- 메일 가독성 개선은 HTML과 plain-text 대체 본문을 요구하되, 기존 SMTP와 Resend 중 구현 수단은 결정 대기로 둔다.
- PDF에 제시된 `GET /_security/user` 후보 계약과 `superuser`·도메인 role 기반 라우팅을 문서화한다. 실제 API·최소 권한·role 정규화는 검증 전이다.
- 도메인 사용자에게 타 도메인 본문이 노출될 수 있는 현재 결함은 사용자 API 연동과 별개로 먼저 차단한다.

## 2026-07-13 구현 반영

- 4xx는 `hostDomain`, 5xx는 `apiDomain`별 요청 수가 각각 최소 `20` 이상일 때만 오류율 임계값을 적용한다.
- `WEB_ERROR_MIN_REQUESTS`와 `SERVER_ERROR_MIN_REQUESTS`를 별도 환경 변수로 제공하며 둘 다 기본값은 `20`이다.
- `src/utils/domain-error-detection.ts`의 공통 정책을 Web/Server Error Job의 탐지·경고와 `src/app.ts`의 최종 alert 변환에 적용해 저트래픽 항목의 메일 유입을 차단한다.
- `GAP-008`은 타입 검사와 자동 테스트 38건 통과를 기준으로 해결 처리했다.
- 자동 검증과 별개로 외부 Elasticsearch 데이터와 SMTP 수신 결과를 확인하는 실서버 QA는 미완료다. 다른 1차·1.1 요구사항도 남아 있어 전체 상태는 `부분 구현` 또는 `계획`을 유지한다.

## 현재 제외 항목

- Docker Compose 기반 로컬 Elasticsearch/Kibana/Logstash
- WSL 실행 가이드
- Kibana 설정 자동화
- IIS 샘플 로그 로컬 적재

## 검증 자료

- [탐지·알림 회귀 QA 계획](test-plans/2026-07-06-detection-regression.md)
- [후속 개발 계획과 파트 분담안](PLANS.md)
