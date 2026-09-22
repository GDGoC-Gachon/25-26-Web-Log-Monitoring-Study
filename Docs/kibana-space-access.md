# Kibana 서비스 Space 접근 제어

## 목적과 보안 경계

서비스 사용자는 자신에게 할당된 웹 서비스의 로그와 저장된 관제 화면만 조회한다. Kibana Space는 대시보드, 저장된 시각화, 데이터 뷰 같은 저장 객체를 구분할 뿐 Elasticsearch 문서를 격리하지 않는다. 따라서 서비스마다 아래 세 가지를 함께 적용한다.

1. 서비스 전용 Kibana Space
2. 같은 도메인 이름의 Elasticsearch Role
3. 해당 서비스 전용 인덱스 또는 별칭에 한정한 `read`, `view_index_metadata`

`iis-*` 전체를 Role의 `names`에 넣는 방식은 금지한다. 서비스 전용 인덱스나 별칭이 준비되지 않았다면 Role과 사용자를 연결하지 않는다. 공유 인덱스만 가능한 환경은 서비스 소유 필드와 검증 가능한 Document-level security(DLS) 쿼리를 운영자가 별도로 승인한 경우에만 사용한다.

## 기준 매핑

| 서비스 도메인 | Kibana Space ID | 표시 이름 | Elasticsearch Role | Role 데이터 원본 |
| --- | --- | --- | --- | --- |
| `sonarqube.gdgoc.net` | `sonarqube-gdgoc-net` | `sonarqube.gdgoc.net` | `sonarqube.gdgoc.net` | 운영자가 확정한 SonarQube 전용 로그 인덱스 또는 별칭 |

도메인 이름은 Role 이름에 그대로 사용한다. Space ID는 Kibana의 소문자 영문, 숫자, 밑줄, 하이픈 제약을 지키기 위해 도메인의 점을 하이픈으로 바꾼다. 운영자가 확정한 데이터 원본은 해당 서비스의 로그만 해석해야 하며, Role JSON과 Space 안의 data view는 정확히 같은 이름만 사용한다.

## Role 선언

아래 선언에서 `<confirmed-sonarqube-log-alias>`는 운영자가 소유권과 대상 인덱스를 확인한 전용 별칭 또는 전용 인덱스로 교체한다. `iis-*`나 다른 서비스와 공유되는 패턴으로 치환하지 않는다.

Kibana 버전에 따라 Feature ID가 다를 수 있다. 적용 직전에 `GET /api/features`로 현재 Stack의 Discover, Dashboard, Visualize Library Feature ID를 확인한다. 아래는 현재 Kibana Role API의 `discover_v2`, `dashboard_v2`, `visualize_v2` ID를 기준으로 한 선언이며, 확인한 ID가 다르면 해당 ID만 바꾸고 `read` 범위와 단일 Space 범위는 바꾸지 않는다.

```json
{
  "elasticsearch": {
    "cluster": [],
    "indices": [
      {
        "names": ["<confirmed-sonarqube-log-alias>"],
        "privileges": ["read", "view_index_metadata"],
        "allow_restricted_indices": false
      }
    ]
  },
  "kibana": [
    {
      "base": [],
      "feature": {
        "discover_v2": ["read"],
        "dashboard_v2": ["read"],
        "visualize_v2": ["read"]
      },
      "spaces": ["sonarqube-gdgoc-net"]
    }
  ],
  "metadata": {
    "service": "sonarqube.gdgoc.net",
    "access": "read-only-service-log"
  },
  "description": "Read-only SonarQube web-log access in its Kibana Space"
}
```

이 Role에는 cluster privilege, `run_as`, 다른 Kibana Space, `base: ["read"]` 또는 `base: ["all"]`, 데이터 뷰 관리, Dev Tools, saved object 관리, 사용자 또는 Role 관리 권한을 넣지 않는다. Feature를 명시적으로 나열하면 새 Kibana 기능이 추가돼도 자동으로 열리지 않는다.

## 적용 순서

1. Kibana 관리자와 `manage_security` 권한을 가진 운영자가 전용 별칭 또는 인덱스의 실제 대상과 서비스 소유권을 확인한다. 확인에 실패하면 적용을 중단한다.
2. Kibana에 ID `sonarqube-gdgoc-net`, 이름 `sonarqube.gdgoc.net`의 Space를 만든다. Space 생성만으로는 로그 문서가 격리되지 않는다.
3. 위 선언을 `PUT /api/security/role/sonarqube.gdgoc.net`에 적용한다. 요청 본문의 `<confirmed-sonarqube-log-alias>`를 1단계에서 확인한 정확한 이름으로 바꾼다.
4. 해당 Space 안에서 운영자가 같은 전용 원본만 가리키는 data view와 읽기 전용 대시보드, 저장된 시각화를 만든다. 서비스 사용자에게 Data View Management나 저장 권한을 주지 않는다.
5. `sonarqube_test`에는 `sonarqube.gdgoc.net` Role만 할당한다. 다른 Role이 `iis-*`, 다른 서비스 원본, 모든 Space, Kibana base privilege를 부여하지 않는지 함께 점검한다. 권한은 할당된 모든 Role의 합집합이다.

현재 서비스 계정은 관리 API에 `401`을 받으므로, 이 저장소의 실행 계정으로 Space나 Role을 적용하지 않는다. 운영 관리자 계정과 전용 데이터 원본이 확정되기 전에는 이 문서의 선언이 적용 계획이며 운영 적용 증적이 아니다.

## 검증 기준

전용 로그가 들어 있는 비운영 테스트 환경에서 `sonarqube_test`로 다음을 확인한다.

| 항목 | 기대 결과 |
| --- | --- |
| `sonarqube-gdgoc-net` Space의 Discover | 전용 data view와 SonarQube 로그만 조회 가능 |
| 같은 Space의 Dashboard 및 저장된 시각화 | 조회 가능, 생성, 수정, 삭제와 저장은 불가 |
| 다른 Space URL 및 다른 서비스 data view | `403` 또는 접근 불가 |
| SonarQube 전용 별칭 검색 | 성공 |
| 다른 서비스 전용 별칭 및 `iis-*` 검색 | `403` 또는 권한 없음 |
| `POST <confirmed-sonarqube-log-alias>/_delete_by_query` with `match_none` | `403`; 허용되면 즉시 Role 회수 및 조사 |
| Index, 사용자, Role, Space 관리 화면과 API | 접근 불가 |

삭제 검증은 테스트 환경에서만 `match_none` 쿼리로 수행한다. 실제 문서, 사용자, Role, Space를 삭제하는 검증 요청은 하지 않는다. 검증 결과에는 테스트 계정, 적용한 Role JSON, Role 목록 점검 결과, 성공 및 거부 HTTP 상태만 남기고 자격 증명과 실제 수신자 주소는 남기지 않는다.

## superuser와 메일

`superuser`는 별도 운영 Role을 통해 전체 운영 접근을 유지하며 이 서비스 Role로 축소하지 않는다. 이 저장소의 `SMTP_TO` 수신자는 모든 보안 알림의 SMTP envelope BCC 수신자로 처리한다. 따라서 서비스 사용자에게 발송되는 메일의 `To` 헤더에는 superuser 주소가 노출되지 않는다. `SMTP_TO`에는 승인된 superuser 수신자만 두고, 서비스 사용자는 `SMTP_DOMAIN_RECIPIENTS`로 관리한다.

Kibana 권한 변경은 메일 수신자 목록을 자동으로 동기화하지 않는다. Elastic 사용자 API와 메일 수신자 동기화는 [Elastic 유저 API 연동 요구사항](requirements/elastic-user-api.md)의 별도 미완료 범위다.

## 참고

- [Kibana Role privilege](https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/kibana-privileges)
- [Kibana Role management](https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/kibana-role-management)
- [Kibana Space API](https://www.elastic.co/guide/en/kibana/current/spaces-api-post.html)
- [Elasticsearch index privilege](https://www.elastic.co/guide/en/elasticsearch/reference/current/security-privileges.html)
