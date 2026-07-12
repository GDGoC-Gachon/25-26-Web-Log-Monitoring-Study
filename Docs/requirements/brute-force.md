# 무차별 대입 탐지 요구사항

| 항목 | 내용 |
|------|------|
| 상태 | QA 필요 |
| 단계 | 1차 |
| 우선순위 | P0 |
| 대상 코드 | `src/jobs/brute-force.job/job.ts` |
| 관련 이슈 | 다중 도메인 동시 발생, 4xx 웹 오류와의 중복·혼재 가능성 |

## 요구사항

| ID | 요구사항 | 상태 |
|----|----------|------|
| REQ-BRUTE-001 | `DETECTION_WINDOW_MINUTES`로 지정한 최근 로그를 조회해야 한다. | 구현됨 |
| REQ-BRUTE-002 | `BRUTE_FORCE_TARGET_PATHS`에 설정한 인증 경로 키워드를 대소문자와 관계없이 포함한 요청을 대상으로 해야 한다. | 구현됨 |
| REQ-BRUTE-003 | `BRUTE_FORCE_STATUS_CODES`에 설정한 실패 응답만 집계해야 한다. 기본값은 400, 401, 403이다. | 구현됨 |
| REQ-BRUTE-004 | `clientIp + hostDomain` 조합별 실패 횟수를 집계해야 한다. | 구현됨 |
| REQ-BRUTE-005 | 실패 횟수가 `BRUTE_FORCE_MAX_FAILURES` 이상이면 해당 조합을 브루트포스로 판단해야 한다. | 구현됨 |
| REQ-BRUTE-006 | `BRUTE_FORCE_EXCLUDED_IPS`에 여러 예외 IP를 등록할 수 있고 해당 IP는 집계에서 제외해야 한다. | 구현됨 |
| REQ-BRUTE-007 | 같은 `clientIp`의 요청이라도 서로 다른 `hostDomain`의 실패 횟수를 합산하지 않아야 한다. | QA 필요 |

## 수용 기준

| ID | 입력 | 기대 결과 |
|----|------|-----------|
| AC-BRUTE-001 | 임계값 30, A 도메인 20회와 B 도메인 20회 | 합산하지 않고 미탐지 |
| AC-BRUTE-002 | 임계값 30, A 도메인 30회와 B 도메인 5회 | A만 탐지 |
| AC-BRUTE-003 | `/AUTH`, 상태 401과 설정된 예외 IP | 예외 IP이므로 미탐지 |
| AC-BRUTE-004 | 인증 401/403이 웹 오류 임계값도 충족 | [알림 수명주기](alert-lifecycle.md)의 승인된 상관 정책으로 추적 |

## QA 메모

코드의 집계 키는 이미 `clientIp + hostDomain`이지만 교차 도메인 회귀 테스트가 없다. 회의에서 제기된 오동작은 [메일 요구사항](mail-notification.md)의 전체 배치 본문 혼재와 함께 재현해야 한다.
