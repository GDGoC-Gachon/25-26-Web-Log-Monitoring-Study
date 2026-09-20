# Elastic 유저 API 연동 요구사항

| 항목 | 내용 |
|------|------|
| 상태 | 부분 구현 |
| 단계 | 1.1 안정화 |
| 우선순위 | P1 |
| 현재 구현 | 매 폴링에서 `GET /_security/user`를 조회해 Elastic role로 SMTP 수신자를 결정 |
| 출처 | 2026-07-06 회의 및 [2026-07-11 오류·기능개선 사항](../feedback/2026-07-11-error-and-feature-improvements.md) |

## 목표

Elastic 사용자 정보와 모니터링 대상·수신자 관계를 조회해 운영자는 전체 경고를, 서비스 사용자는 자신의 도메인 경고만 받게 한다. PDF가 제시한 후보 계약은 아래와 같지만 실제 운영 응답과 권한을 검증하기 전까지 확정 계약으로 간주하지 않는다.

## 후보 API 계약

| 항목 | PDF 제시값 | 확정 필요 사항 |
|------|------------|----------------|
| 메서드·경로 | `GET https://api.gdgoc.net/_security/user` | 운영 base URL과 경로 사용 가능 여부 |
| 인증 | Basic Auth | 조회 전용 최소 권한과 자격 증명 분리 여부 |
| 사용자 식별 | 응답 객체의 key와 `username` | 안정적인 고유 ID |
| 수신 주소 | `email` | 빈 값·중복·잘못된 형식 처리 |
| 활성 여부 | `enabled` | 비활성 전환 반영 시점 |
| 전체 권한 | `roles`에 `superuser` | 정확한 role 이름과 대소문자 정책 |
| 도메인 권한 | 탐지 `hostDomain`과 정확히 같은 role | 정규화, 별칭, 와일드카드 없이 정확 일치 |

## 요구사항

| ID | 요구사항 | 상태 |
|----|----------|------|
| REQ-EUSER-001 | PDF가 제시한 `GET /_security/user`의 운영 base URL, 인증, 요청·응답 스키마, 오류 코드를 실제 API와 대조해 승인해야 한다. | 결정 대기 |
| REQ-EUSER-002 | Elastic 사용자 조회 전용 최소 권한 자격 증명과 원본 응답은 서버에서만 사용하고 브라우저·메일·일반 로그에 노출하지 않아야 한다. | 구현됨 |
| REQ-EUSER-003 | 사용자와 허용 `hostDomain`은 role 문자열과 탐지 도메인의 정확 일치로 연결해야 한다. | 구현됨 |
| REQ-EUSER-004 | API 실패 또는 타임아웃 시 정적 매핑이나 캐시로 대체하지 않고 해당 폴링의 SMTP 발송을 보류해야 한다. | 구현됨 |
| REQ-EUSER-005 | 사용자 매핑의 생성·변경·삭제와 동기화 실패를 감사 가능하게 기록해야 한다. | 계획 |
| REQ-EUSER-006 | `enabled=true`이고 유효한 `email`을 가진 사용자만 알림 수신 후보에 포함해야 한다. | 구현됨 |
| REQ-EUSER-007 | `superuser` role을 가진 사용자는 모든 도메인의 경고를 SMTP envelope BCC로 수신해야 하며 `Bcc` 헤더는 생성하지 않아야 한다. | 구현됨 |
| REQ-EUSER-008 | 서비스 사용자는 role과 정확히 일치하는 도메인의 단일 탐지만 `To`로 수신해야 한다. | 구현됨 |

`REQ-EUSER-006`의 비활성 사용자 제외는 PDF 본문의 직접 요구가 아니라 샘플 응답의 `enabled` 필드를 근거로 추가한 파생 안전 요구사항이다.

## 구현 경계

- `ELASTIC_USERNAME`과 `ELASTIC_PASSWORD`는 IIS 로그 조회용 Basic Auth로만 사용한다.
- `ELASTIC_USER_API_USERNAME`과 `ELASTIC_USER_API_PASSWORD`는 `GET /_security/user` 전용 최소 권한 계정이다.
- 응답에서 활성·유효 이메일 사용자만 남기고, 원본 사용자 응답과 자격 증명은 로그에 기록하지 않는다.
- 사용자 조회 실패와 타임아웃에는 `mail_notification_user_lookup_failed`만 기록하고 SMTP 연결을 만들지 않는다.
- 사용자 생성·수정, role 생성, 사용자-도메인 동기화 감사는 이 저장소의 범위가 아니다.

## 계약 확정 체크리스트

- [ ] API 담당자와 PDF 후보 계약의 공식 사양서·버전 확인
- [ ] 개발·운영 base URL과 `GET /_security/user` 호출 가능 여부
- [ ] 필요한 최소 권한
- [ ] 사용자 고유 ID와 이메일 필드
- [ ] role 생성 규칙과 사용자-`hostDomain` 관계의 정본
- [x] 도메인 role은 정규화하지 않고 정확히 일치
- [ ] pagination, rate limit, timeout, retry 계약
- [ ] 비활성·삭제 사용자 처리
- [ ] 장애 시 fail-open 또는 fail-closed 정책
- [ ] 테스트 계정과 비밀정보 주입 방식

## 완료 조건

로컬 자동 테스트는 활성·비활성·잘못된 이메일·정확한 role·`superuser` BCC·조회 실패 보류를 확인한다. 실제 운영 API 권한과 SMTP 수신 결과는 별도 QA가 필요하다.
