#!/usr/bin/env bash
set -euo pipefail

GATEWAY_URL="${HOSTED_GATEWAY_URL:-${EXPO_PUBLIC_AI_API_URL:-}}"
AI_URL="${HOSTED_AI_URL:-}"

if [[ -z "${GATEWAY_URL}" ]]; then
  cat >&2 <<'USAGE'
HOSTED_GATEWAY_URL is required.

Example:
  HOSTED_GATEWAY_URL=https://daily-discipline-security-gateway.onrender.com npm run hosted:check

Optional:
  HOSTED_AI_URL=https://daily-discipline-ai.onrender.com npm run hosted:check
USAGE
  exit 1
fi

trim_slash() {
  printf "%s" "$1" | sed 's:/*$::'
}

check_health() {
  local label="$1"
  local base_url
  base_url="$(trim_slash "$2")"
  local url="${base_url}/health"

  echo "Checking ${label}: ${url}"
  curl -fsS --max-time 8 "${url}"
  echo
}

check_health "security gateway" "${GATEWAY_URL}"

if [[ -n "${AI_URL}" ]]; then
  check_health "AI backend" "${AI_URL}"
else
  echo "HOSTED_AI_URL not set, skipping direct AI check. The phone app should call the gateway, not the AI service."
fi

cat <<'DONE'
Hosted backend check passed.
Next:
  npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value <gateway-url>
  npm run tester:build
DONE
