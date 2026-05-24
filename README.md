# Web Log Monitoring Study

IIS 웹 서버 로그를 Elasticsearch API로 폴링하여 이상 징후 감지 시 이메일 알림을 전송하는 Node.js + TypeScript 서비스입니다.

## 개요

| 항목 | 내용 |
|------|------|
| 런타임 | Node.js + TypeScript (ESM) |
| 로그 소스 | IIS 웹 서버 (`iis-*` 인덱스) |
| 쿼리 엔진 | Elasticsearch ES\|QL |
| 알림 수단 | Resend (이메일) |
| 폴링 주기 | 1분 (`config.jobsPollingMinutes`) |

## 아키텍처

```
src/
├── app.ts                         # 진입점 — setInterval로 모든 잡 실행
├── config.ts                      # 전역 설정 (폴링 주기 등)
├── jobs/
│   ├── brute-force.job/job.ts     # 무차별 대입 로그인 시도 탐지
│   ├── DDos.job/job.ts            # DDoS 패턴 탐지
│   ├── server-error.job/job.ts    # 5xx 서버 오류 모니터링
│   ├── web-error.job/job.ts       # 4xx 웹 오류 모니터링
│   └── mail-notification.job/job.ts # Resend를 통한 이메일 알림 전송
└── utils/
    ├── elastic-query.client.ts    # ES|QL로 로그 조회
    └── elastic-user.client.ts     # Elasticsearch 사용자 목록 조회
```

**잡 패턴:** 각 잡은 `src/jobs/<name>.job/job.ts`에 위치하며, 단일 async 함수를 export합니다. 실패 시 빈 배열을 반환하고 예외를 throw하지 않습니다.

**에러 로깅 형식:** `[ISO timestamp] [filename] [ERROR] - message`

## 시작하기

### 환경 변수 설정

`.env.example`을 복사하여 `.env`를 생성하고 값을 채웁니다.

```bash
cp .env.example .env
```

| 변수 | 설명 |
|------|------|
| `ELASTIC_USERNAME` | Elasticsearch Basic Auth 사용자명 |
| `ELASTIC_PASSWORD` | Elasticsearch Basic Auth 비밀번호 |
| `RESEND_TOKEN` | Resend API 이메일 발송 토큰 |

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (tsx 사용, 빌드 불필요)
npm run dev

# 타입 체크
npx tsc --noEmit
```

## 주요 규칙

- ESM 전용 프로젝트 (`"type": "module"`); import 경로에 `.ts` 확장자 사용
- `tsconfig.json`의 `noEmit: true` — `tsx`로 직접 실행, 컴파일 아웃풋 불사용
- TypeScript 엄격 모드: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 활성화
- 잡은 실패해도 예외를 throw하지 않고 빈 배열 반환

## Elasticsearch 쿼리 예시

```esql
FROM iis-*
| WHERE @timestamp > NOW() - 5m
| DROP *.keyword
| SORT @timestamp DESC
```

## 라이선스

이 프로젝트는 학습 목적으로 작성되었습니다.
