# 요구사항 작업 현황 대시보드

`src/jobs` 도메인별 요구사항 상태를 추적하는 대시보드입니다. 상세 요구사항 설명은 각 도메인 문서를 기준으로 관리합니다.

## 상태 기준

| 상태 | 의미 |
| --- | --- |
| 미착수 | 대상 코드가 스텁이거나 구현 근거가 아직 없다. |
| 진행 | 일부 기반 또는 요구사항이 구현되었지만 완료 검증 전이다. |
| 완료 | 요구사항 구현과 검증 근거가 모두 확인되었다. |

## 도메인별 현황

| 도메인 | 상태 | 상세 문서 | 대상 코드 | 요구사항 ID | P0 | P1 | P2 | 비고 |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 공통 실행 기반 | 진행 | [common-platform.md](requirements/common-platform.md) | `src/app.ts`, `src/config.ts`, `src/utils/*` | REQ-001~005, REQ-021~028, REQ-030 | 7 | 6 | 1 | 프로젝트 구조와 실행 진입점은 있으나 설정, 로깅, 테스트, 문서화 요구사항은 추가 구현 필요 |
| 무차별 대입 공격 탐지 | 미착수 | [brute-force.md](requirements/brute-force.md) | `src/jobs/brute-force.job/job.ts` | REQ-006~007 | 2 | 0 | 0 | 잡 함수가 스텁 상태 |
| DDoS 공격 탐지 | 미착수 | [ddos.md](requirements/ddos.md) | `src/jobs/DDos.job/job.ts` | REQ-008~009 | 2 | 0 | 0 | 잡 함수가 스텁 상태 |
| 웹 4xx 에러 탐지 | 미착수 | [web-error.md](requirements/web-error.md) | `src/jobs/web-error.job/job.ts` | REQ-010~011 | 2 | 0 | 0 | 잡 함수가 스텁 상태 |
| 서버 5xx 에러 탐지 | 미착수 | [server-error.md](requirements/server-error.md) | `src/jobs/server-error.job/job.ts` | REQ-012~013 | 2 | 0 | 0 | 잡 함수가 스텁 상태 |
| 메일 알림 | 미착수 | [mail-notification.md](requirements/mail-notification.md) | `src/jobs/mail-notification.job/job.ts` | REQ-014~020, REQ-029 | 5 | 3 | 0 | 잡 함수가 스텁 상태 |

## 전체 진행 요약

| 상태 | 도메인 수 |
| --- | ---: |
| 미착수 | 5 |
| 진행 | 1 |
| 완료 | 0 |

| 우선순위 | 요구사항 수 |
| --- | ---: |
| P0 | 20 |
| P1 | 9 |
| P2 | 1 |

## 도메인 문서 역할

| 문서 | 역할 |
| --- | --- |
| [common-platform.md](requirements/common-platform.md) | 공통 실행 기반, 설정, API 연동, 품질, 2차 대응 자동화 요구사항 |
| [brute-force.md](requirements/brute-force.md) | 무차별 대입 공격 탐지 요구사항 |
| [ddos.md](requirements/ddos.md) | DDoS 공격 탐지 요구사항 |
| [web-error.md](requirements/web-error.md) | 웹 4xx 에러 급증 탐지 요구사항 |
| [server-error.md](requirements/server-error.md) | 서버 5xx 에러 급증 탐지 요구사항 |
| [mail-notification.md](requirements/mail-notification.md) | 사용자 조회, 수신 대상 선정, 이메일 발송 요구사항 |

## 관리 원칙

- 이 문서는 진행 상태와 상세 문서 링크만 관리한다.
- 요구사항 설명, 판단 기준, 예외 조건은 도메인 문서에만 작성한다.
- 구현이 진행되면 도메인별 `상태`와 `비고`를 먼저 갱신한다.
