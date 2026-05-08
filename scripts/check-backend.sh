#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AI_URL="${AI_URL:-http://127.0.0.1:8000}"

echo "Checking mobile app TypeScript and lint..."
cd "$ROOT_DIR"
npm run qa

echo "Checking Python backend syntax..."
python3 -c "compile(open('ai/main.py', encoding='utf-8').read(), 'ai/main.py', 'exec')"

echo "Checking AI backend health at ${AI_URL}..."
if curl -fsS --max-time 5 "${AI_URL}/health" >/tmp/daily-discipline-ai-health.json; then
  cat /tmp/daily-discipline-ai-health.json
  echo
else
  echo "AI backend health check failed. Start it with: npm run ai:dev" >&2
  exit 1
fi

echo "Checking SQLite analytics endpoint..."
curl -fsS --max-time 5 "${AI_URL}/v1/analytics/completion-by-time" >/tmp/daily-discipline-ai-analytics.json
cat /tmp/daily-discipline-ai-analytics.json
echo

if command -v go >/dev/null 2>&1; then
  echo "Checking Go stats aggregator..."
  (cd services/stats-aggregator && go test ./...)

  echo "Checking Go security gateway..."
  (cd services/security-gateway && go test ./...)
else
  echo "Go is not installed, skipping Go compile check."
fi

echo "Backend operational checks complete."
