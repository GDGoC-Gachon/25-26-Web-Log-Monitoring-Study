@echo off
setlocal

if not exist ".env" (
  echo [ERROR] .env file is missing.
  echo Create it first:
  echo   copy .env.example .env
  exit /b 1
)

echo [INFO] Starting Web Log Monitoring Study on Windows...
npm run dev:app

endlocal
