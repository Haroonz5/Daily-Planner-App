#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "1/5 Expo, TypeScript, ESLint, dependency, and config checks"
npm run qa:device

echo "2/5 Secret scan"
npm run security:check

echo "3/5 Go security gateway tests"
(
  cd services/security-gateway
  GOCACHE="${GOCACHE:-/tmp/daily-discipline-go-build-cache}" go test ./...
)

echo "4/5 Go stats service tests"
(
  cd services/stats-aggregator
  GOCACHE="${GOCACHE:-/tmp/daily-discipline-go-build-cache}" go test ./...
)

echo "5/5 Release notes"
cat <<'NOTES'
Release check passed.

Next manual steps:
- Deploy Firestore rules with: npm run deploy:rules
- Confirm AI health in Settings on a real phone
- Create an EAS preview build with: npm run eas:preview
- For iOS TestFlight, build production with: npm run eas:testflight
NOTES
