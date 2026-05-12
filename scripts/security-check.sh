#!/usr/bin/env bash
set -euo pipefail

echo "Running repository security checks..."

if git ls-files | grep -E '(^|/)\.env($|\.local$|\.production$)' >/dev/null; then
  echo "A real .env file is tracked. Keep secrets in local env files only." >&2
  git ls-files | grep -E '(^|/)\.env($|\.local$|\.production$)' >&2
  exit 1
fi

# I added this check to catch backend secrets before GitHub sees them. Firebase
# web API keys are intentionally public-ish client config, so this focuses on
# Gemini/OpenAI keys, service accounts, and credentialed database URLs.
if git grep -nE '(GEMINI_API_KEY|OPENAI_API_KEY|FIREBASE_SERVICE_ACCOUNT|DATABASE_URL).*(AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,}|postgres://[^[:space:]]+:[^[:space:]]+@)' -- \
  ':!*.example' \
  ':!README.md' \
  ':!**/README.md' \
  ':!docs/**' \
  ':!scripts/security-check.sh' >/tmp/daily-discipline-secret-scan.txt; then
  cat /tmp/daily-discipline-secret-scan.txt >&2
  echo "Potential secret found in tracked source. Move it to local env/config." >&2
  exit 1
fi


# Scan for raw provider keys even if they are not assigned to the expected env
# variable name. The Firebase client apiKey in constants/firebaseConfig.ts is
# intentionally public client configuration, so it is excluded here.
if git grep -nE '(sk-[A-Za-z0-9_-]{20,}|AIzaSy[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' -- \
  ':!*.example' \
  ':!README.md' \
  ':!**/README.md' \
  ':!docs/**' \
  ':!constants/firebaseConfig.ts' \
  ':!firebase.env' \
  ':!scripts/security-check.sh' >/tmp/daily-discipline-raw-secret-scan.txt; then
  cat /tmp/daily-discipline-raw-secret-scan.txt >&2
  echo "Raw-looking secret found in tracked source. Move it to env/secret storage." >&2
  exit 1
fi

echo "Repository security checks passed."
