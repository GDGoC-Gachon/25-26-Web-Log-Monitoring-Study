# 공통 플랫폼 요구사항

| 항목 | 내용 |
|------|------|
| 상태 | QA 필요 |
| 단계 | 1차 |
| 우선순위 | P0 |
| 대상 코드 | `src/config.ts`, `src/utils/elastic.client.ts`, `src/utils/elastic-query.client.ts` |

## 요구사항

| ID | 요구사항 | 상태 |
|----|----------|------|
| REQ-001 | 시스템은 기본 `https://api.gdgoc.net/` Elasticsearch API를 호출할 수 있고 환경 변수로 엔드포인트를 변경할 수 있어야 한다. | 구현됨 |
| REQ-002 | 시스템은 Basic Auth 계정 정보를 `.env`에서 읽고 사용자명과 비밀번호가 모두 있을 때만 인증 설정을 사용해야 한다. | 구현됨 |
| REQ-003 | 시스템은 기본 `iis-*` 인덱스를 ES\|QL `POST /_query`로 조회하고 인덱스 패턴을 환경 변수로 변경할 수 있어야 한다. | 구현됨 |
| REQ-004 | 탐지 폴링 주기와 조회 구간은 각각 `JOBS_POLLING_MINUTES`, `DETECTION_WINDOW_MINUTES`로 변경할 수 있어야 한다. | 구현됨 |
| REQ-005 | API·SMTP 장애 로그와 테스트 증적에 계정 정보나 비밀번호를 출력하지 않아야 한다. | QA 필요 |

## 수용 기준

- URL 끝의 `/` 유무와 관계없이 올바른 Elasticsearch node URL을 구성한다.
- Basic Auth 두 값이 모두 제공되면 인증 요청을 구성한다.
- ES\|QL 요청은 `/_query`, JSON 응답 형식, 설정된 `iis-*` 패턴과 조회 창을 사용한다.
- 비밀값을 제외한 설정과 요청 실패 원인을 운영자가 추적할 수 있어야 한다. 현재 Elastic 요청 실패 격리와 오류 문자열 마스킹은 추가 QA가 필요하다.

## 현재 범위와 차기 범위

현재 Elastic 연동은 IIS 로그 조회용이다. 사용자 조회·동기화는 구현되어 있지 않으며 [Elastic 유저 API 요구사항](elastic-user-api.md)에서 별도 관리한다.

## 검증

- `npm run check`
- `npm test`
