# Daily Discipline

Daily Discipline is a mobile productivity app built with Expo, React Native,
Firebase, and a FastAPI AI backend. It helps users plan realistic days, recover
from missed tasks, build streaks, earn XP, unlock companion pets, focus without
drifting, and stay accountable with friends.

The app is built around one idea: discipline works better when planning,
feedback, rewards, and accountability all live in the same loop.

## Highlights

- AI task planning from natural language, such as `Gym at 6 PM, study for 2 hours at 8 PM`
- AI memory that learns preferred planning windows from completion history
- Voice-assisted planning through phone keyboard dictation
- Reality checks for overloaded schedules
- AI rescheduling for missed tasks
- AI backend health card with response time, model/fallback status, and timeout visibility
- Feature flags for turning advanced tester/demo systems on or off without deleting code
- Go security gateway for Firebase token checks, rate limits, proxying, audit logs, and an admin dashboard
- Docker Compose full-stack setup for Postgres, Python AI, Go security gateway, and Go stats service
- AI planner evaluation suite that checks natural-language parsing, recurrence, priorities, and durations
- End-to-end smoke testing with Maestro plus CI-safe E2E flow validation
- Demo Mode for seeding a realistic portfolio/tester account in one tap
- Admin analytics dashboard for audit logs, failures, rate limits, latency, and completion-by-time data
- Weekly discipline report card designed for sharing or screenshot export
- Real daily and weekly report export as shareable SVG image cards and lightweight PDF files
- Hosted backend deployment blueprint for Render with Python AI, Go gateway, Go stats service, and Postgres
- Push notification friend nudges through Firebase Cloud Functions and Expo push tokens
- Admin tester dashboard for task, feedback, diagnostics, analytics, and backend health signals
- Crash/error viewer for tester diagnostics without needing a native crash SDK yet
- Production privacy page with analytics and crash-reporting opt-outs
- Calendar sync now creates, updates, pulls, and cleans exported task events
- Notification actions support Complete, Snooze, Tomorrow, and Skip from lock-screen reminders
- Personalized onboarding stores first-week goal and planning intensity for AI rules after signup
- AI coach memory timeline that summarizes when the user performs best and where friction appears
- Smart accountability contracts for friends who want higher-trust discipline checks
- Cloud Functions scaffold for widget summary refresh and ongoing routine refill
- Offline-first task queue that stores task intent locally and syncs after reconnect
- Lightweight crash/error reporting into each user's Firestore `appErrors`
- Account security with verified email changes, password reset, and authenticator-app 2FA
- Setup Quest checklist for new users
- Weekly Focus goal shown on the Today screen
- Daily feedback, pattern feedback, weekly review, routine coaching, and task breakdowns
- Today dashboard with readiness score, energy mode, recovery missions, and future planning
- One-time, future, and recurring tasks
- Ongoing routines like `gym every day except Sunday` without dumping weeks of duplicate tasks
- Task templates for common routines and custom saved tasks
- Routine Manager with health score, streaks, pause, skip-next, edit, and cancel-all controls
- XP rewards with unlockable companion pets and custom pet sprites
- Focus Mode with Strict Focus app-switch strike tracking, haptics, sounds, and focus music
- App-wide idle sound cue plus task-created, AI-preview, save, share, warning, and completion feedback
- Accountability friends with usernames, nudges, progress sharing, watchlists, auto-completing challenges, and badge history
- Stats dashboard with Discipline Score, weekly review, time-window analysis, and XP progress
- Month calendar, next-7-days planner, native phone calendar export, and basic pull-sync from moved calendar events
- Public landing page for testers or portfolio demos
- Shareable daily progress card
- Local notifications for task reminders, morning summaries, evening planning, Complete, Snooze, and Skip
- Multiple themes including light, dark, GitHub Dark, Amazon Light, Jade Glass, Mango Rush, Arctic Night, and Graphite Gold
- Discipline Pro preview toggle for showing future subscription-style packaging without locking testers out
- Tester tools for feedback, reminder health, data reset, and account deletion

## Core Screens

### Today

The command center for the day. It shows daily progress, XP, companion status,
readiness, recovery prompts, missed-task support, upcoming plans, and quick links
to Focus, Week, Summary, and Friends. It also includes a first-run setup quest,
weekly focus goal, and an evening review prompt when the day is ready to close.

### Add Task

Users can add tasks manually or use **Plan with AI**:

```txt
Gym at 6 PM every day, study for 2 hours at 8 PM
```

The planner extracts structured tasks with dates, times, duration estimates,
priority, notes, and recurrence rules. Settings also includes **AI Planning
Rules**, so users can save preferences like `no workouts on Sunday` or `keep
school tasks before 9 PM`.

Users can also load built-in task templates or save their own custom templates
for recurring personal routines.

The **Speak Task** button focuses the planner input so users can use the phone
keyboard microphone and say something like:

```txt
Add a task to do homework tomorrow at 7 PM
```

### Focus

Focus Mode starts a timer tied to a task. Strict Focus pauses and records strikes
when the user leaves the app. Clean strict sessions give bonus XP. True native
app blocking requires a development/custom build with platform-specific APIs.

### Friends

Users can add friends by username or email, share progress, send accountability
nudges, and start challenges. Friend cards show a small task watchlist so nudges
can be specific instead of generic. Challenges now auto-complete into a badge
history, and team pushes can record an MVP.

### Stats

Stats shows Discipline Score, XP, streaks, weekly progress, time-window quality,
plan-vs-reality data, task mix, AI weekly review, and next-week recommendations.

### Interview Systems

Settings includes a small portfolio/demo area with Demo Mode, Admin Analytics,
AI Memory Timeline, and Weekly Report. These screens make it easier to test the
app quickly, explain the architecture, and show the backend/security work during
an interview without needing days of real user data.

### Pet Home

Users unlock companion pets through XP, pick an active companion, rename pets,
change habitats, and track bond progress.

## Polish And QA

Recent polish work added a feature-flag layer in `constants/featureFlags.ts`, app-wide idle feedback through `hooks/use-idle-feedback.ts`, and smoother Add Task save states so AI drafts, manual tasks, and breakdown steps confirm quickly without blocking reminder sync.

`npm run qa` now runs TypeScript, core recurrence/time regression checks, and ESLint. The core checks specifically protect ongoing routines like `gym every day except Sunday` from turning back into huge batches of duplicate future tasks.

## Report Export

Daily and weekly summaries can now leave the app as more than plain text:

- `Share Text` uses the native share sheet with a compact text recap.
- `Export Image` writes a shareable SVG card to the local cache and opens the share sheet.
- `Export PDF` writes a lightweight PDF report to the local cache and opens the share sheet.

The export helper lives in `utils/report-export.ts`, so the same system can power
future Instagram-style cards, accountability receipts, or weekly email reports.

## AI System

The AI backend lives in `ai/` and exposes a FastAPI service. The mobile app only
knows the backend URL through `EXPO_PUBLIC_AI_API_URL`; Gemini/OpenAI keys stay
private in the backend environment.

Supported AI features:

- Natural-language task parsing
- Reality checks
- Missed-task rescheduling
- Pattern feedback
- Daily feedback
- Weekly review
- Routine coaching
- Task breakdowns

The app has local fallback logic for every AI feature. If the backend is offline,
Gemini is slow, or no model key is configured, the app still works and uses the
built-in planner. AI calls are intentionally timed out quickly so adding a task
does not feel frozen. Settings includes an AI Backend Status card for checking
whether the backend is reachable and model-powered.

## Tech Stack

- Expo 54
- React Native 0.81
- React 19
- TypeScript
- Expo Router
- Firebase Authentication
- Cloud Firestore
- Expo Notifications
- AsyncStorage
- FastAPI
- Python
- Go security gateway
- Go microservice for stats aggregation
- SQLite analytics endpoint
- PostgreSQL security audit log
- Firebase Cloud Functions
- Bash operational scripts
- Gemini or OpenAI API
- EAS Build
- Render-ready backend setup

## Project Structure

```txt
my-app/
  app/
    (tabs)/
      index.tsx        # Today dashboard
      explore.tsx      # Add Task and AI planner
      stats.tsx        # Stats and weekly review
      settings.tsx     # Settings tab wrapper
      _layout.tsx      # Bottom tab navigation
    focus.tsx          # Focus Mode and Strict Focus
    friends.tsx        # Friends, nudges, and challenges
    pet-home.tsx       # Pet collection and habitats
    summary.tsx        # Daily summary and share card
    weekly-report.tsx  # Weekly report card and share text
    ai-memory-timeline.tsx # AI coach memory timeline
    admin-analytics.tsx # Gateway/admin analytics dashboard
    admin-tester-dashboard.tsx # Tester build health dashboard
    crash-viewer.tsx   # In-app diagnostic/error viewer
    privacy.tsx        # Privacy, analytics, and AI data controls
    demo-mode.tsx      # Seedable demo account tools
    week.tsx           # Calendar and future planner
    settings.tsx       # Full settings screen
    onboarding.tsx
    tutorial.tsx
    landing.tsx
    login.tsx
    signup.tsx

  ai/
    main.py            # FastAPI backend
    eval_planner.py    # AI planner regression/evaluation runner
    evals/             # JSON evaluation cases
    requirements.txt
    Dockerfile
    README.md

  e2e/
    maestro/           # Maestro device smoke tests

  services/
    security-gateway/  # Go middleware for auth, rate limiting, audit logs
    stats-aggregator/  # Go microservice for task event aggregation

  functions/
    index.js           # Cloud Functions for widget summary and routine refill

  assets/
    images/
    pets/

  components/
  constants/
  docs/
  hooks/
  utils/

  firestore.rules
  firebase.json
  eas.json
  render.yaml
```

## Tester-Safe Deployment

For sharing the app on someone else's phone, do not depend on your laptop or Cloud Functions. Use this path:

```bash
npm run deploy:rules
npm run tester:check
npm run tester:build
```

Required for tester builds:

- Firestore rules deployed with `npm run deploy:rules`.
- EAS preview build installed on the tester phone.
- Optional hosted Go security gateway set through `EXPO_PUBLIC_AI_API_URL`.

Optional / Blaze-only:

- `npm run functions:deploy` now safely skips on Spark/free Firebase and explains why. After upgrading to Blaze, use `npm run functions:deploy:blaze` for server push nudges and routine refill functions.

The preview and production EAS profiles set `EXPO_PUBLIC_REQUIRE_SECURE_AI=true`, so real tester builds will not silently call your laptop localhost/LAN backend. If no hosted gateway is configured, AI features use the built-in local fallback instead of freezing.

## Local Setup

Install dependencies:

```bash
npm install
```

Start Expo:

```bash
npx expo start
```

Run app checks:

```bash
npm run qa
```

Run the no-dependency core regression checks by themselves:

```bash
npm run test:core
```

Run the AI planner evaluation suite:

```bash
npm run ai:eval
```

Validate the E2E smoke flow used by CI:

```bash
npm run e2e:validate
```

## Hosted Backend Deployment

The repo includes a production-shaped hosting path:

- `render.yaml` defines the Python AI backend, Go security gateway, Go stats aggregator, and Postgres audit database.
- `docs/HOSTED_BACKEND_DEPLOYMENT.md` explains the full setup and EAS environment variables.
- Tester builds should point `EXPO_PUBLIC_AI_API_URL` at the hosted Go gateway, not a laptop IP.

```bash
npm run tester:build
```

For local Docker testing:

```bash
npm run stack:up
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_IP:8020 npx expo start -c
```

## Docker Compose Full Stack

For a production-shaped local demo, run Postgres, the Python AI backend, the Go
security gateway, and the Go stats service together:

```bash
npm run stack:up
```

The stack exposes:

- Python AI backend: `http://127.0.0.1:8000`
- Go security gateway: `http://127.0.0.1:8020`
- Go stats aggregator: `http://127.0.0.1:8010`
- PostgreSQL audit database: `127.0.0.1:5432`

Point Expo at the gateway for the full secure path:

```bash
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_IP:8020 npx expo start -c
```

Useful stack commands:

```bash
npm run stack:config
npm run stack:logs
npm run stack:down
```

Use `.env.stack.example` as a reference for local stack values. Keep model keys
in `ai/.env` or hosted backend secrets, never in the mobile app.

## Firebase Setup

Required Firebase features:

- Email/password authentication
- Email verification
- Cloud Firestore
- Public username reservations in `publicUsernames`
- Firestore rules from `firestore.rules`

Deploy rules:

```bash
npx firebase-tools@latest login
npm run deploy:rules
```

Friend requests, usernames, nudges, challenges, tester feedback, public progress,
and widget summary data depend on the latest rules being deployed.

## AI Backend Setup

Create and activate the Python environment:

```bash
cd ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `ai/.env`:

```env
AI_PROVIDER=auto
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3-flash-preview
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
AI_ALLOWED_ORIGINS=*
AI_TIMEOUT_SECONDS=5
```

Run the backend from the project root:

```bash
npm run ai:dev
```

The backend also includes a small SQLite analytics slice:

- `POST /v1/analytics/events` stores anonymized task events.
- `GET /v1/analytics/completion-by-time` runs a SQL query that returns average completion rate by time of day.

Local analytics data is stored under `ai/data/` and is not committed.

## Security Gateway

For a production-shaped setup, point the mobile app at the Go security gateway
instead of directly at the Python AI backend:

```txt
React Native app -> Go security gateway -> Python AI backend
```

The gateway lives in `services/security-gateway/` and handles:

- Firebase ID token verification
- Optional or required Firebase App Check token verification
- Rate limiting by uid or IP, with stricter limits for AI-heavy endpoints
- CORS origin allowlisting for deployed web/custom clients
- Proxying `/v1/...` requests to the Python backend
- PostgreSQL audit logging for `uid`, endpoint, timestamp, IP, and status
- A token-protected `/admin` dashboard for request volume, failures, suspicious IPs, and rate limits

Run it locally:

```bash
npm run security:dev
```

For secure local development with Expo, Python, and Go together:

```bash
npm run dev:secure
```

Production gateway environment:

```env
AI_BACKEND_URL=https://your-python-ai-backend.example.com
SECURITY_AUTH_MODE=firebase
FIREBASE_PROJECT_ID=daily-planner-76712
APP_CHECK_MODE=optional
SECURITY_ALLOWED_ORIGINS=https://your-app-domain.example.com
DATABASE_URL=postgres://user:password@host:5432/database?sslmode=require
ADMIN_DASHBOARD_TOKEN=long-random-value
RATE_LIMIT_PER_MINUTE=60
AI_RATE_LIMIT_PER_MINUTE=20
```

Use `APP_CHECK_MODE=off` for Expo Go/local development, `optional` while you are
rolling App Check out, and `required` only after the mobile app is sending valid
`X-Firebase-AppCheck` tokens.

After deploying the gateway, set the mobile app URL to the gateway:

```env
EXPO_PUBLIC_AI_API_URL=https://your-security-gateway.example.com
```

For a real phone, Expo needs your Mac's local network IP:

```bash
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_IP:8020 npx expo start -c
```

You can also start Expo with the helper script:

```bash
npm run start:ai
```

## Go Stats Microservice

The repository includes a standalone Go service at `services/stats-aggregator/`.
It accepts task events and returns completion-rate aggregates. The app does not
depend on it, but it demonstrates a separate backend/infra service next to the
Python AI backend.

```bash
npm run ai:stats
```

Endpoints:

- `GET /health`
- `POST /v1/events`
- `GET /v1/completion-rate`

## Cloud Functions

The `functions/` folder adds production-style Firebase automation:

- `updateWidgetSummaryOnTaskWrite` keeps `widgetSummary/today` fresh after task changes.
- `refillRollingRoutines` creates the next occurrence for ongoing routines each night.
- `sendPushOnAccountabilityNudge` sends Expo push notifications when friends send accountability nudges.

Check syntax:

```bash
npm run functions:check
```

Deploy after installing Firebase tools and logging in:

```bash
npm run functions:deploy
```

## Ops Scripts and CI

Operational scripts live in `scripts/`:

```bash
npm run ops:check
npm run ops:deploy:ai
```

GitHub Actions checks TypeScript, core recurrence logic, E2E flow syntax, ESLint,
the security script, npm audit, Python backend syntax, the AI planner evaluation
suite, Go services, and Docker Compose configuration.

## Production Analytics And Privacy

Daily Discipline now has a small production analytics layer:

- Owner-scoped analytics events are written under each user's `analyticsEvents`.
- Task analytics can be sent to the backend SQL endpoint for completion-by-time analysis.
- Settings links to Privacy, Crash Viewer, Admin Tester Dashboard, and Admin Analytics.
- Users can opt out of product analytics and crash/error reporting from the Privacy screen.

This keeps the app useful for tester data while making the privacy story clear
for reviewers, friends, and interviewers.

## API Key Safety

Do not commit Gemini or OpenAI keys. Keep them only in `ai/.env` locally or as
secret environment variables on the deployed backend.

The mobile app should only receive:

```env
EXPO_PUBLIC_AI_API_URL=https://your-backend-url
```

If a model key was ever shared in chat, screenshots, or GitHub, rotate it before
testing with other people.

## AI Endpoints

- `GET /health`
- `POST /v1/parse-tasks`
- `POST /v1/reality-check`
- `POST /v1/reschedule`
- `POST /v1/daily-feedback`
- `POST /v1/pattern-feedback`
- `POST /v1/weekly-review`
- `POST /v1/routine-coach`
- `POST /v1/breakdown-task`

## Available Scripts

```bash
npm run start
npm run start:ai
npm run ios
npm run android
npm run web
npm run lint
npm run typecheck
npm run qa
npm run qa:device
npm run release:full-check
npm run release:check
npm run ai:dev
npm run deploy:rules
npm run functions:check
npm run functions:deploy
npm run tester:build
npm run eas:simulator
npm run eas:production
npm run eas:testflight
```

## Testing With Other People

Before sending a tester build:

```bash
npm run release:check
npm run deploy:rules
```

Tester account privacy:

- Email typo domains like `.con` are blocked before Firebase sends verification.
- Usernames are reserved in `publicUsernames`, so testers cannot claim the same username.
- Friend lookup is username-first and public friend records do not expose email addresses.

App Check / gateway hardening:

- Preview builds should point `EXPO_PUBLIC_AI_API_URL` at the hosted Go security gateway.
- Set `SECURITY_AUTH_MODE=firebase` on the gateway for tester builds.
- Keep `APP_CHECK_MODE=optional` until a native build has App Check tokens wired, then move it to `required` for production.
- The gateway health endpoint no longer exposes the private Python AI backend URL.

Create an internal EAS build:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform all
```

If using the deployed AI/security stack, add the Go security gateway URL as an EAS secret. Do not point tester builds at your laptop IP:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-security-gateway-url
```

Useful tester docs:

- `docs/INTERVIEW_DEMO.md`
- `docs/E2E_TESTING.md`
- `docs/TESTER_HANDOFF.md`
- `docs/TESTING_AND_RELEASE.md`
- `docs/PRODUCTION_CHECKLIST.md`
- `docs/RELEASE_PIPELINE.md`

## Current Limitations

- Expo Go does not fully support production notification behavior. Use a development or preview build for realistic notification testing.
- Strict Focus tracks app switching in Expo Go, but true app blocking needs native Screen Time / FamilyControls or Android focus integrations.
- Home-screen widgets require native widget UI in a custom build, but widget-ready summary data is already written to Firestore.
- Report exports use local SVG/PDF files without extra native dependencies; a later pass can add view capture for exact pixel screenshots.
- Friend features require deployed Firestore rules.

## Roadmap Ideas

- Native home-screen widget
- Deeper friend challenge history
- More pet habitats and unlockable cosmetics
- Native distraction blocking
- Push notifications or cloud functions for friend nudges
- App Store and Play Store release

## Purpose

Daily Discipline is designed to make productivity feel personal, realistic, and
rewarding. Instead of only tracking tasks, it helps users understand their
patterns, recover from misses, and build consistency over time.

## Hosted Tester Build Flow

Use this order when preparing a build that behaves like an installed App Store/TestFlight app:

```bash
npm run tester:check
npm run deploy:rules
HOSTED_GATEWAY_URL=https://your-gateway.onrender.com npm run hosted:check
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-gateway.onrender.com
npm run tester:build
```

For iOS TestFlight:

```bash
npm run testflight:build
npm run testflight:submit
```

The mobile app should only know the hosted Go security gateway URL. Gemini/OpenAI keys stay on the hosted backend.

## Production-Ready Tester Features

- Hosted Python AI backend plus Go security gateway health checks.
- EAS preview, platform-specific tester builds, and TestFlight command shortcuts.
- Crash-style Firestore diagnostics, local error buffer, and in-app Crash Viewer.
- Native calendar sync for one task from Week Planner or 30 days from Settings.
- Widget-ready summary cache plus Widget Preview screen for lock-screen/home-screen planning.
