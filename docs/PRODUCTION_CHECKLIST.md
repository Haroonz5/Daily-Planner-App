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
- Complete, skip, edit, and pause a routine.
- Routine Manager shows health, streak, and AI coach.
- Task completion haptics and sounds play when enabled.
- Focus music starts and stops cleanly.
- Summary share card opens the native share sheet.
- Notifications arrive once and actions work in a preview/dev build.
