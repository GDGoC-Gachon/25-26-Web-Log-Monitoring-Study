# SMTP 메일 알림 요구사항

대상 코드: `src/jobs/mail-notification.job/job.ts`

| ID | 요구사항 |
|----|----------|
| REQ-MAIL-001 | 탐지 결과가 존재하면 SMTP를 통해 담당자에게 알림 메일을 발송해야 한다. |
| REQ-MAIL-002 | SMTP 접속 정보와 수신자 목록은 `.env`에서 관리해야 한다. |
| REQ-MAIL-003 | 탐지 결과 메일에는 탐지 항목과 사유를 포함해야 한다. |
| REQ-MAIL-004 | Elastic 계정에 등록된 이메일 정보를 기준으로 메일을 발송해야 한다. |
| REQ-MAIL-005 | superuser는 모든 탐지 메일을 수신해야 한다. |
| REQ-MAIL-006 | 서비스 사용자는 등록한 domain에 대한 탐지만 수신해야 한다. |
| REQ-MAIL-007 | 메일 발송 실패 시 에러 로그를 기록해야 한다. |
