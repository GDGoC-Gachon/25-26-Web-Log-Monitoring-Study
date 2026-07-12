# 웹 서비스 오류 탐지 요구사항

| 항목 | 내용 |
|------|------|
| 상태 | 부분 구현 |
| 단계 | 1차 |
| 우선순위 | P0 |
| 대상 코드 | `src/jobs/web-error.job/job.ts`, `src/utils/domain-error-detection.ts`, `src/config.ts`, `src/app.ts` |
| 관련 이슈 | 인증 4xx의 브루트포스 중복 집계 |
| 추가 출처 | [2026-07-11 오류 및 기능개선 사항](../feedback/2026-07-11-error-and-feature-improvements.md) |

## 요구사항

| ID | 요구사항 | 상태 |
|----|----------|------|
| REQ-4XX-001 | `DETECTION_WINDOW_MINUTES`로 지정한 최근 로그를 조회해야 한다. | 구현됨 |
| REQ-4XX-002 | IIS 로그의 `hostDomain`별 전체 요청 수를 계산해야 한다. | 구현됨 |
| REQ-4XX-003 | HTTP 400~499 응답 수를 `hostDomain`별로 집계해야 한다. | 구현됨 |
| REQ-4XX-004 | 최소 요청 수를 충족한 집계의 4xx 비율이 `WEB_ERROR_RATE_PERCENT` 이상이면 해당 `hostDomain`의 웹 오류 급증으로 판단해야 한다. | 구현됨 |
| REQ-4XX-005 | `EXCLUDED_DOMAINS`에 여러 예외 `hostDomain` 또는 `apiDomain`을 등록할 수 있어야 한다. | 부분 구현 |
| REQ-4XX-006 | 예외 `hostDomain`은 집계 결과에서 제외해야 한다. | 구현됨 |
| REQ-4XX-007 | 인증 경로의 400/401/403이 브루트포스에도 포함되면 승인된 사건 상관·표시 정책을 적용해야 한다. | 결정 대기 |
| REQ-4XX-008 | 집계한 전체 요청 수가 설정 가능한 최소 요청 수 이상일 때만 `WEB_ERROR_RATE_PERCENT`를 적용해 경고를 생성해야 한다. | 구현됨 |

## 수용 기준

- 2xx, 3xx, 5xx는 전체 요청 수에는 포함하되 4xx 오류 수에는 포함하지 않는다.
- 임계값과 같은 비율도 탐지한다.
- `WEB_ERROR_MIN_REQUESTS`의 기본값은 20이다. 요청 1건 중 4xx 1건은 100%로 집계되더라도 탐지하지 않는다.
- 같은 설정에서 전체 요청이 정확히 20건이고 4xx 비율이 임계값 이상이면 탐지한다.
- 최소 요청 수는 각 `hostDomain`과 조회 창에 독립적으로 적용하며 서로 다른 도메인의 요청 수를 합산하지 않는다.
- 예외 `hostDomain`은 결과와 알림에 포함하지 않는다.
- 브루트포스와 같은 원시 요청을 사용한 경우 [알림 수명주기 요구사항](alert-lifecycle.md)에 따라 중복 관계를 추적할 수 있다.

## 구현 주의

`src/utils/domain-error-detection.ts`의 공통 판정은 요청 수 하한과 오류율 임계값을 함께 검사한다. `webErrorJob`의 `detected`와 `src/app.ts`가 사용하는 최종 알림 변환에 같은 판정을 적용하며, 기본값·경계값·도메인별 독립 적용은 `tests/monitoring.test.ts`에서 자동 검증한다. 실제 서버 로그와 SMTP를 사용한 회귀 QA는 별도로 수행한다.

## 미결정 사항

- 브루트포스 조건을 충족한 인증 4xx를 웹 오류 분모·분자에 그대로 유지할지, 사건 표시 단계에서만 묶을지 결정한다.
