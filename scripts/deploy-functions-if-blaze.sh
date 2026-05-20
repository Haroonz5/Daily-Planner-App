#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_BLAZE:-}" != "1" ]]; then
  cat <<'MESSAGE'
Cloud Functions skipped.

Firebase Cloud Functions require the Blaze pay-as-you-go plan. This app is still functional for tester builds without Functions:
- Firestore rules work
- tasks, AI fallback, stats, friends, in-app nudges, local notifications, calendar sync, reports, and privacy screens work
- only server push nudges and nightly backend routine refill wait for Functions

If you upgrade Firebase to Blaze and want to deploy Functions, run:

  npm run functions:deploy:blaze

MESSAGE
  exit 0
fi

npx firebase-tools@latest deploy --only functions
