#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "1/6 Expo, TypeScript, ESLint, dependency, and config checks"
npm run qa:device

echo "2/6 Secret scan"
npm run security:check

echo "3/6 Go security gateway tests"
(
  cd services/security-gateway
  GOCACHE="${GOCACHE:-/tmp/daily-discipline-go-build-cache}" go test ./...
)

echo "4/6 Go stats service tests"
(
  cd services/stats-aggregator
  GOCACHE="${GOCACHE:-/tmp/daily-discipline-go-build-cache}" go test ./...
)

echo "5/6 Tester readiness check"
node scripts/check-tester-readiness.js

echo "6/6 Release notes"
cat <<'NOTES'
Release check passed.

Next manual steps:
- Deploy Firestore rules with: npm run deploy:rules
- Check hosted gateway health with: HOSTED_GATEWAY_URL=https://your-gateway npm run hosted:check
- Set EXPO_PUBLIC_AI_API_URL as an EAS secret after hosting the Go gateway
- Create an EAS preview build with: npm run tester:build
- Create an iOS TestFlight candidate with: npm run testflight:build
- Cloud Functions are optional and require Firebase Blaze; do not block Spark/free tester builds on them
- Confirm AI health in Settings on a real phone
- For iOS TestFlight, build production with: npm run eas:testflight
NOTES
