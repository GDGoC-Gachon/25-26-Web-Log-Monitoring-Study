#!/usr/bin/env sh
set -eu

if [ ! -f ".env" ]; then
  echo "[ERROR] .env file is missing."
  echo "Create it first:"
  echo "  cp .env.example .env"
  exit 1
fi

echo "[INFO] Starting Web Log Monitoring Study on macOS/Linux..."
npm run dev:app
