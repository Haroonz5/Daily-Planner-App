#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-daily-discipline-ai}"
AI_URL="${AI_URL:-http://127.0.0.1:8000}"

cd "$ROOT_DIR"

echo "Running release checks before backend deployment..."
npm run qa
python3 -c "compile(open('ai/main.py', encoding='utf-8').read(), 'ai/main.py', 'exec')"

if command -v docker >/dev/null 2>&1; then
  echo "Building AI Docker image: ${IMAGE_NAME}"
  docker build -t "${IMAGE_NAME}" ai
else
  echo "Docker is not installed, skipping local image build."
fi

echo "Checking configured backend health: ${AI_URL}"
if curl -fsS --max-time 5 "${AI_URL}/health"; then
  echo
  echo "Backend responded. If this is your deployed URL, it is ready for the app."
else
  echo
  echo "Health check did not respond. Deploy to Render/EAS environment, then rerun with:" >&2
  echo "AI_URL=https://your-ai-backend.example.com bash scripts/deploy-ai.sh" >&2
fi

cat <<'NEXT_STEPS'

Deployment checklist:
1. Set GEMINI_API_KEY or OPENAI_API_KEY as a secret on the backend host.
2. Set AI_PROVIDER=auto and AI_TIMEOUT_SECONDS=5.
3. Set ANALYTICS_DB_PATH to a persistent disk path if your host supports disks.
4. Deploy the Go security gateway with AI_BACKEND_URL pointing at this backend.
5. Set DATABASE_URL on the gateway so PostgreSQL audit logs are written.
6. Set SECURITY_AUTH_MODE=firebase and FIREBASE_PROJECT_ID on the gateway.
7. Point the Expo app at the gateway with EXPO_PUBLIC_AI_API_URL.
8. Run npm run release:check before shipping a tester build.
NEXT_STEPS
