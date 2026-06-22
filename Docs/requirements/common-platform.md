# 공통 플랫폼 요구사항

대상 코드: `src/config.ts`, `src/utils/elastic.client.ts`, `src/utils/elastic-query.client.ts`

| ID | 요구사항 |
|----|----------|
| REQ-001 | 시스템은 `https://api.gdgoc.net/` Elasticsearch API를 호출할 수 있어야 한다. |
| REQ-002 | 시스템은 Basic Auth 계정 정보를 `.env`에서 읽어야 한다. |
| REQ-003 | 시스템은 `iis-*` 인덱스를 ES\|QL로 조회해야 한다. |
| REQ-004 | 탐지 주기와 조회 구간은 환경 변수로 변경 가능해야 한다. |
| REQ-005 | 장애가 발생해도 계정 정보나 비밀번호를 로그에 출력하지 않아야 한다. |

## 검증

- `npm run check`
- `npm test`
