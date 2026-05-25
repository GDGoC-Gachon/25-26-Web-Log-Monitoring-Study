# SMTP 메일 알림 요구사항

대상 코드: `src/jobs/mail-notification.job/job.ts`

| ID | 요구사항 |
|----|----------|
| REQ-MAIL-001 | 탐지 결과가 존재하면 SMTP를 통해 담당자에게 알림 메일을 발송해야 한다. |
| REQ-MAIL-002 | SMTP 접속 정보와 수신자 목록은 `.env`에서 관리해야 한다. |
| REQ-MAIL-003 | 알림 메일에는 탐지 시나리오, 심각도, 근거 데이터가 포함되어야 한다. |
