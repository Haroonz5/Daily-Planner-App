# Production Checklist

Use this before sending Daily Discipline to a larger tester group or a store
review.

## 1. Rotate Secrets

The Gemini key should live only in the backend environment. If a key was shared
in chat, screenshots, or GitHub, rotate it before release.

Required backend secrets:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_rotated_gemini_key
GEMINI_MODEL=gemini-3-flash-preview
AI_ALLOWED_ORIGINS=*
AI_TIMEOUT_SECONDS=5
```

The mobile app should only receive:

```env
EXPO_PUBLIC_AI_API_URL=https://your-backend-url
```

## 2. Backend

Deploy the FastAPI backend from `ai/` and confirm:

```txt
https://your-backend-url/health
```

returns:

```json
{"ok": true}
```

Then test:

- Natural-language planning returns `source: "gemini"`.
- Routine coach returns `source: "gemini"`.
- Settings > AI Backend Status reports the deployed backend and model state.
- If Gemini is unavailable, the app still falls back to local planning.
- If Gemini is slow, the app falls back quickly instead of blocking task creation.

## 3. Firebase

Deploy rules:

```bash
npm run deploy:rules
```

Confirm these work without permission errors:

- Signup/login
- Tasks and rolling routines
- Friend requests
- Accountability nudges
- Friend challenges
- Username lookup and `publicUsernames`
- Public progress sharing
- Tester feedback
- Widget summary writes

## 4. Build

Run:

```bash
npm run release:check
```

Set the backend URL for EAS builds:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-backend-url
```

Create a preview build:

```bash
npm run eas:preview
```

## 5. Device Pass

Test on a real phone:

- Plan with AI uses Gemini.
- A fresh account sees the Setup Quest and can set a Weekly Focus Goal.
- Complete, skip, edit, and pause a routine.
- Routine Manager shows health, streak, and AI coach.
- Task completion haptics and sounds play when enabled.
- Focus music starts and stops cleanly.
- Summary share card opens the native share sheet.
- Notifications arrive once and actions work in a preview/dev build.

## 6. Production Gateway And Push

Run the full production preflight:

```bash
npm run production:preflight
```

For hosted services:

```bash
HOSTED_GATEWAY_URL=https://your-gateway-url npm run hosted:check
GATEWAY_URL=https://your-gateway-url ADMIN_DASHBOARD_TOKEN=token npm run load:gateway
```

Before a larger tester release, confirm:

- Go gateway `/health` is reachable.
- Gateway health reports `audit_db: true`.
- Admin dashboard loads with the private token.
- `MAX_BODY_BYTES` is visible in `/health`.
- AI requests show in PostgreSQL audit logs.
- Firestore rules are deployed.
- Cloud Functions are deployed if the Firebase project is on Blaze.
- Push receipts appear under `users/{uid}/pushReceipts` after a nudge or due-task push.
