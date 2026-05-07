# Daily Discipline

Daily Discipline is a mobile productivity app built with Expo, React Native,
Firebase, and a FastAPI AI backend. It helps users plan realistic days, recover
from missed tasks, build streaks, earn XP, unlock companion pets, focus without
drifting, and stay accountable with friends.

The app is built around one idea: discipline works better when planning,
feedback, rewards, and accountability all live in the same loop.

## Highlights

- AI task planning from natural language, such as `Gym at 6 PM, study for 2 hours at 8 PM`
- Voice-assisted planning through phone keyboard dictation
- Reality checks for overloaded schedules
- AI rescheduling for missed tasks
- Daily feedback, pattern feedback, weekly review, routine coaching, and task breakdowns
- Today dashboard with readiness score, energy mode, recovery missions, and future planning
- One-time, future, and recurring tasks
- Ongoing routines like `gym every day except Sunday` without dumping weeks of duplicate tasks
- Routine Manager with health score, streaks, pause, skip-next, edit, and cancel-all controls
- XP rewards with unlockable companion pets and custom pet sprites
- Focus Mode with Strict Focus app-switch strike tracking, haptics, sounds, and focus music
- Accountability friends with usernames, nudges, progress sharing, watchlists, and challenges
- Stats dashboard with Discipline Score, weekly review, time-window analysis, and XP progress
- Month calendar, next-7-days planner, and Google Calendar export links
- Shareable daily progress card
- Local notifications for task reminders, morning summaries, evening planning, Complete, and Snooze
- Multiple themes including light, dark, GitHub Dark, Amazon Light, Void Black, Slate Steel, and Rose Quartz
- Tester tools for feedback, reminder health, data reset, and account deletion

## Core Screens

### Today

The command center for the day. It shows daily progress, XP, companion status,
readiness, recovery prompts, missed-task support, upcoming plans, and quick links
to Focus, Week, Summary, and Friends.

### Add Task

Users can add tasks manually or use **Plan with AI**:

```txt
Gym at 6 PM every day, study for 2 hours at 8 PM
```

The planner extracts structured tasks with dates, times, duration estimates,
priority, notes, and recurrence rules. Settings also includes **AI Planning
Rules**, so users can save preferences like `no workouts on Sunday` or `keep
school tasks before 9 PM`.

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
can be specific instead of generic.

### Stats

Stats shows Discipline Score, XP, streaks, weekly progress, time-window quality,
plan-vs-reality data, task mix, AI weekly review, and next-week recommendations.

### Pet Home

Users unlock companion pets through XP, pick an active companion, rename pets,
change habitats, and track bond progress.

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
does not feel frozen.

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
    week.tsx           # Calendar and future planner
    settings.tsx       # Full settings screen
    onboarding.tsx
    tutorial.tsx
    login.tsx
    signup.tsx

  ai/
    main.py            # FastAPI backend
    requirements.txt
    Dockerfile
    README.md

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

For a real phone, Expo needs your Mac's local network IP:

```bash
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_IP:8000 npx expo start -c
```

You can also start Expo with the helper script:

```bash
npm run start:ai
```

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
npm run release:check
npm run ai:dev
npm run deploy:rules
npm run eas:preview
npm run eas:simulator
npm run eas:production
```

## Testing With Other People

Before sending a tester build:

```bash
npm run release:check
npm run deploy:rules
```

Create an internal EAS build:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform all
```

If using a deployed AI backend, add the URL as an EAS secret:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-backend-url
```

Useful tester docs:

- `docs/TESTER_HANDOFF.md`
- `docs/TESTING_AND_RELEASE.md`
- `docs/PRODUCTION_CHECKLIST.md`

## Current Limitations

- Expo Go does not fully support production notification behavior. Use a development or preview build for realistic notification testing.
- Strict Focus tracks app switching in Expo Go, but true app blocking needs native Screen Time / FamilyControls or Android focus integrations.
- Home-screen widgets require native widget work in a custom build.
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
