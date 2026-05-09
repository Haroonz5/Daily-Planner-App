#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AI_URL="${AI_URL:-http://127.0.0.1:8000}"
GATEWAY_PORT="${GATEWAY_PORT:-8020}"
GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:${GATEWAY_PORT}}"
SECURITY_AUTH_MODE="${SECURITY_AUTH_MODE:-dev}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-daily-planner-76712}"
APP_CHECK_MODE="${APP_CHECK_MODE:-off}"
SECURITY_ALLOWED_ORIGINS="${SECURITY_ALLOWED_ORIGINS:-*}"
AI_RATE_LIMIT_PER_MINUTE="${AI_RATE_LIMIT_PER_MINUTE:-20}"

AI_PID=""
GATEWAY_PID=""

cleanup() {
  if [[ -n "${AI_PID}" ]]; then
    kill "${AI_PID}" 2>/dev/null || true
  fi
  if [[ -n "${GATEWAY_PID}" ]]; then
    kill "${GATEWAY_PID}" 2>/dev/null || true
  fi
}

wait_for_health() {
  local name="$1"
  local url="$2"

  for _ in {1..30}; do
    if curl -fsS --max-time 2 "${url}" >/dev/null; then
      echo "${name} is healthy at ${url}"
      return 0
    fi
    sleep 1
  done

  echo "${name} did not become healthy at ${url}" >&2
  return 1
}

trap cleanup EXIT INT TERM

if ! command -v go >/dev/null 2>&1; then
  cat >&2 <<'GO_INSTALL'
Go is required for the security gateway, but it is not installed yet.

On this Mac, install Go 1.23+ with one of these options:
  1. Official installer: https://go.dev/dl/ -> macOS ARM64 package
  2. Homebrew, if you install Homebrew later: brew install go

After installing Go:
  1. Restart your terminal
  2. Run: go version
  3. Run: npm run dev:secure
GO_INSTALL
  exit 1
fi

cd "$ROOT_DIR"

echo "Starting Python AI backend..."
npm run ai:dev &
AI_PID="$!"
wait_for_health "AI backend" "${AI_URL}/health"

echo "Starting Go security gateway..."
(
  cd services/security-gateway
  PORT="${GATEWAY_PORT}" \
  AI_BACKEND_URL="${AI_URL}" \
  SECURITY_AUTH_MODE="${SECURITY_AUTH_MODE}" \
  FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID}" \
  APP_CHECK_MODE="${APP_CHECK_MODE}" \
  SECURITY_ALLOWED_ORIGINS="${SECURITY_ALLOWED_ORIGINS}" \
  AI_RATE_LIMIT_PER_MINUTE="${AI_RATE_LIMIT_PER_MINUTE}" \
  go run .
) &
GATEWAY_PID="$!"
wait_for_health "Security gateway" "${GATEWAY_URL}/health"

echo "Starting Expo pointed at the security gateway..."
echo "Expo AI URL: ${GATEWAY_URL}"
EXPO_PUBLIC_AI_API_URL="${GATEWAY_URL}" npx expo start -c
