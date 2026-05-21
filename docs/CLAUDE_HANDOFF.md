# Daily Discipline Claude Handoff

Use this as the copy-paste project context for continuing in Claude or another coding assistant.

## Project

Daily Discipline is an Expo/React Native productivity app focused on discipline loops: plan the day, avoid unrealistic schedules, complete tasks honestly, earn XP, unlock companion pets, focus without distractions, and stay accountable with friends.

Repo path on Haroon's machine:

```txt
/Users/haroonzaman/App/my-app
```

Primary stack:

- Expo 54 / React Native 0.81 / React 19 / TypeScript
- Expo Router tabs and stack screens
- Firebase Auth and Cloud Firestore
- Expo Notifications, Calendar, Haptics, SecureStore, AV, Image
- Python FastAPI AI backend in `ai/`
- Go security gateway in `services/security-gateway/`
- Go stats service in `services/stats-aggregator/`
- PostgreSQL audit logs for gateway requests
- SQLite analytics file for the AI backend
- Firebase Cloud Functions in `functions/`
- Docker Compose and Render deployment blueprints
- EAS preview/production builds

## Major Mobile Features Already Built

- Auth flow with signup, login, password reset, optional skip verification for testing, usernames, email update support, and authenticator-app 2FA scaffolding.
- Today dashboard with task list, progress, XP, readiness score, weekly focus goal, setup quest, recovery prompts, calendar/future planning links, and smoother scrolling after task operations.
- Add Task screen with manual task creation, future dates, exact day/time picking, templates, saved custom templates, AI planning, task breakdowns, and voice-assisted input through keyboard dictation.
- AI planner can parse text like `gym every day except Sunday at 6pm`, `gym Mon-Thurs at 6pm`, and multi-task phrases like `gym at 6, study 2 hours at 8`.
- Ongoing/rolling routines: instead of dumping 46 future tasks, recurring routines create the next occurrence as the user completes or skips today. There is also a recurring task manager with pause, skip next, edit, and cancel-all style controls.
- Tasks support Low/Medium/High priority, notes, completion proof, calendar IDs, recurrence groups, focus stats, and offline queue metadata.
- Be Honest check for high-priority completion prompts, positioned high enough to stay readable above the keyboard.
- Confetti/celebration upgraded from a simple falling animation to a more satisfying completion feedback moment with sound/haptics options.
- Focus Mode with timer, strict focus app-switch strikes, haptics, calm focus music, session stats, and native iOS Focus Shield scaffold.
- Friends system with username/email search, friend requests, public profiles, progress sharing, nudges, watchlists, challenges, smart accountability contracts, badges, and friend accountability flows.
- Pet/XP reward system with custom PNG pet assets, unlock progression, pet naming persistence, habitats, and bond progress.
- Stats screen with Discipline Score, XP, streaks, weekly review, plan-vs-reality, completion by time, task mix, pattern feedback, and cleaner polished UI.
- Summary and weekly report screens with shareable text, SVG image cards, and lightweight PDF export.
- Settings tab/screen with theme dropdowns, notification controls, sound/haptic toggles, AI backend status, feature flags, tester tools, privacy controls, admin analytics, crash viewer, demo mode, and account deletion.
- Many themes were added, including light/dark variants, GitHub Dark, Amazon Light, Jade Glass, Mango Rush, Arctic Night, Graphite Gold, plus additional unique palettes. Lighter themes use darker text for readability.
- Onboarding/tutorial for new users and personalization fields for planning intensity/goals.
- Offline-first task queue that stores task intent locally and syncs after reconnect.
- Calendar sync exports tasks to native calendars, updates exported events, pulls basic moved calendar events, and cleans old exports.
- Widget/lock-screen support scaffold: widget summary cache in Firestore and iOS WidgetKit scaffold.

## AI Backend Features Already Built

Python FastAPI backend in `ai/main.py` supports:

- natural-language task parsing
- reality checks for overloaded schedules
- missed-task rescheduling
- pattern feedback
- daily feedback
- weekly review
- routine coaching
- task breakdowns
- planner memory inputs
- recurrence parsing and priority inference
- local fallback planner when Gemini/OpenAI is unavailable
- SQLite analytics endpoint for completion-by-time style data
- quick timeout behavior so task creation does not freeze if the model is slow

The app should not expose Gemini/OpenAI keys. Model keys belong only in backend env variables.

Important env:

```env
AI_PROVIDER=auto
GEMINI_API_KEY=secret-on-backend-only
OPENAI_API_KEY=secret-on-backend-only
EXPO_PUBLIC_AI_API_URL=https://your-gateway-url
EXPO_PUBLIC_REQUIRE_SECURE_AI=true
```

## Backend/Security Architecture

Current production-shaped flow:

```txt
Expo app -> Go security gateway -> Python AI backend
                 |
                 v
              PostgreSQL audit logs
```

The Go security gateway handles:

- Firebase ID token verification in production mode
- Firebase App Check verification in optional or required mode
- rate limits by uid/IP
- stricter AI endpoint rate limits
- request body limit through `MAX_BODY_BYTES`
- CORS and security headers
- request IDs
- proxying to the AI backend
- PostgreSQL audit logging
- token-protected admin analytics dashboard

Firestore rules protect:

- owner-only user data
- validated task docs
- usernames/public profiles
- friend requests/friends
- accountability nudges/challenges
- appErrors and analyticsEvents
- read-only push receipts for users, written only by Cloud Functions/Admin SDK

## Push Notifications

There are two layers:

- Mobile local notifications through Expo Notifications for reminders and actions.
- Firebase Cloud Functions for server-side push attempts.

Functions in `functions/index.js` include:

- `updateWidgetSummaryOnTaskWrite`: refreshes widget summary when tasks change.
- `refillRollingRoutines`: creates next task occurrence for rolling routines daily.
- `sendPushOnAccountabilityNudge`: sends Expo push when a friend nudge is created.
- `sendDueTaskPushReminders`: scheduled every 5 minutes; sends task due pushes and writes `pushReceipts`.

Cloud Functions deploy requires Firebase Blaze. Firestore rules can be deployed on Spark/free.

## Production/Deployment Assets

- `docker-compose.yml`: local full stack with Postgres, AI backend, Go gateway, and stats service.
- `render.yaml`: hosted blueprint with App Check optional mode for tester compatibility.
- `render.production.yaml`: production blueprint with `APP_CHECK_MODE=required` once the native app sends App Check tokens.
- `.github/workflows/ci.yml`: CI for Node QA, hosted preflight, security check, Functions syntax, Python AI evals, Go tests, Docker Compose config, and shell syntax.
- `load/k6/gateway-load.js`: k6 load test for gateway health/admin endpoints.
- `docs/HOSTED_BACKEND_DEPLOYMENT.md`: hosted backend instructions.
- `docs/SECURITY_GATEWAY.md`: gateway security details and SQL queries.
- `docs/PUSH_PIPELINE.md`: push pipeline details.
- `docs/OBSERVABILITY.md`: logging, audit dashboard, load testing, and diagnostics.
- `docs/PRODUCTION_CHECKLIST.md`: release checklist.
- `docs/TESTER_HANDOFF.md`: tester sharing notes.

## Useful Commands

Install/check:

```bash
cd /Users/haroonzaman/App/my-app
npm install
npm run tester:check
npm run production:preflight
```

Local secure full stack:

```bash
npm run dev:secure
```

If ports are stuck:

```bash
lsof -i :8000
lsof -i :8020
kill <PID>
```

Docker full stack:

```bash
npm run stack:up
npm run stack:logs
npm run stack:down
```

AI eval:

```bash
npm run ai:eval
```

Gateway load test:

```bash
npm run load:gateway:local
```

Firestore rules:

```bash
npm run deploy:rules
```

Functions, Blaze only:

```bash
npm run functions:deploy:blaze
```

Preview tester build:

```bash
npm run tester:build
```

Hosted checks:

```bash
HOSTED_GATEWAY_URL=https://your-gateway-url npm run hosted:check
```

## Current Production Pass Changes

The latest pass added:

- Scheduled Cloud Function for due-task push reminders.
- Push receipt storage under `users/{uid}/pushReceipts`.
- Firestore rules blocking client-forged push receipts.
- Gateway body-size limiting with `MAX_BODY_BYTES`.
- More security headers, including HSTS.
- `render.production.yaml` for App Check required mode.
- iOS native Focus Shield scaffold in `native/ios-focus/`.
- `scripts/prepare-ios-focus-extension.sh` for copying the scaffold after prebuild.
- k6 load test in `load/k6/gateway-load.js`.
- stronger GitHub Actions CI/CD workflow.
- docs for push pipeline and observability.

## Known Constraints / Things To Be Careful With

- Do not commit real `.env`, Gemini keys, OpenAI keys, service account JSON, or database passwords.
- Cloud Functions deploy requires Firebase Blaze; app still works without them but friend push nudges/server task pushes will not run.
- App Check required mode should only be enabled after the native app reliably sends valid App Check tokens. Until then, use optional mode for testers.
- True app blocking/focus shielding on iOS requires native entitlements and a development/custom build, not Expo Go.
- Expo Go has notification limitations; use EAS preview/dev builds for realistic notification testing.
- Render starter services can cold start; keep AI timeouts short so task creation remains responsive.
- The app has lots of features, so avoid adding huge new UI without checking performance on the Today screen.

## What To Work On Next

Strong next engineering tasks:

- Add Expo push ticket receipt polling for delivery outcomes.
- Add Sentry or Firebase Crashlytics for real native crash reporting.
- Add OpenTelemetry tracing between Go and Python.
- Finish native iOS Focus Shield integration in a prebuilt/development build.
- Add real widget extension targets after `npx expo prebuild`.
- Add scheduled backend report generation for weekly PDFs.
- Add production App Check token retrieval on the mobile side and switch gateway to required mode.
- Add Playwright/web admin tests and Maestro device tests in CI if runners are available.

## App Check Implementation Status

Gateway-side App Check is implemented with `off`, `optional`, and `required` modes. `render.production.yaml` enables required mode for production hosting.

The mobile client token path is intentionally not forced yet because the current Expo/Firebase JS SDK setup does not automatically provide native iOS App Attest/DeviceCheck or Android Play Integrity tokens. Keep tester builds on optional mode until a custom native build/provider is added and verified.
