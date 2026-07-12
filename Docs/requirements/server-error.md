# 서버 오류 탐지 요구사항

| 항목 | 내용 |
|------|------|
| 상태 | 부분 구현 |
| 단계 | 1차 |
| 우선순위 | P0 |
| 대상 코드 | `src/jobs/server-error.job/job.ts`, `src/utils/domain-error-detection.ts`, `src/config.ts`, `src/app.ts` |
| 현재 차이 | 결과의 `domain`은 요청 호스트가 아니라 API 경로 세그먼트임 |
| 추가 출처 | [2026-07-11 오류 및 기능개선 사항](../feedback/2026-07-11-error-and-feature-improvements.md) |

## 용어

현재 코드는 `/api/v1/orders/...` 또는 `/api/orders/...`에서 `orders`를 추출해 `domain`으로 저장한다. 이 문서에서는 이를 `apiDomain`이라 부르며 IIS 로그의 요청 호스트인 `hostDomain`과 구분한다.

## 요구사항

| ID | 요구사항 | 상태 |
|----|----------|------|
| REQ-5XX-001 | `DETECTION_WINDOW_MINUTES`로 지정한 최근 `/api/` 또는 `/api/v1/` 로그를 조회해야 한다. | 구현됨 |
| REQ-5XX-002 | API 경로의 첫 업무 세그먼트를 `apiDomain`으로 추출해야 한다. | 구현됨 |
| REQ-5XX-003 | `apiDomain`별 전체 API 요청 수를 계산해야 한다. | 구현됨 |
| REQ-5XX-004 | HTTP 500~599 응답 수를 `apiDomain`별로 집계해야 한다. | 구현됨 |
| REQ-5XX-005 | 최소 요청 수를 충족한 집계의 5xx 비율이 `SERVER_ERROR_RATE_PERCENT` 이상이면 해당 `apiDomain`의 서버 오류 급증으로 판단해야 한다. | 구현됨 |
| REQ-5XX-006 | `EXCLUDED_DOMAINS`의 예외 `apiDomain`은 집계 결과에서 제외해야 한다. | 부분 구현 |
| REQ-5XX-007 | 사용자별 알림·대시보드에 사용하기 전에 원본 `hostDomain`을 함께 보존하고 `apiDomain`과 별도 필드로 전달해야 한다. | 계획 |
| REQ-5XX-008 | 집계한 전체 API 요청 수가 설정 가능한 최소 요청 수 이상일 때만 `SERVER_ERROR_RATE_PERCENT`를 적용해 경고를 생성해야 한다. | 구현됨 |

## 수용 기준

- `/api/v1/orders/list`와 `/api/orders/detail`은 `apiDomain=orders`로 집계한다.
- `/web/login`과 같은 비 API 경로는 집계하지 않는다.
- `SERVER_ERROR_MIN_REQUESTS`의 기본값은 20이다. API 요청 1건 중 5xx 1건은 100%로 집계되더라도 탐지하지 않는다.
- 같은 설정에서 전체 API 요청이 정확히 20건이고 5xx 비율이 임계값 이상이면 탐지한다.
- 최소 요청 수는 각 `apiDomain`과 조회 창에 독립적으로 적용한다. `hostDomain` 보존 이후에는 테넌트 경계를 넘겨 합산하지 않는다.
- 서로 다른 `hostDomain`에 같은 API 경로가 존재할 때 사용자별 결과가 섞이지 않는다.
- 예외 목록에서 `hostDomain`과 `apiDomain`의 의미를 구분할 수 있다.

## 구현 주의

`src/utils/domain-error-detection.ts`의 공통 판정은 요청 수 하한과 오류율 임계값을 함께 검사한다. `serverErrorJob`의 `detected`와 `src/app.ts`가 사용하는 최종 알림 변환에 같은 판정을 적용하며, 기본값과 경계값은 `tests/monitoring.test.ts`에서 자동 검증한다. 실제 서버 로그와 SMTP를 사용한 회귀 QA는 별도로 수행한다. 또한 `hostDomain`을 보존하기 전에는 Elastic 사용자의 도메인 role과 `apiDomain`을 직접 대조하지 않는다.

## 마이그레이션 주의

현재 `EXCLUDED_DOMAINS`와 `DetectionAlert.domain`은 서로 다른 의미를 공유한다. 필드와 설정을 분리할 때 기존 환경 변수 호환성과 메일 라우팅 회귀 테스트가 필요하다.
