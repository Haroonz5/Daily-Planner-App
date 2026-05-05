# Daily Discipline

Daily Discipline is a mobile productivity app built with Expo, React Native, Firebase, and a FastAPI AI backend. It is designed to help users plan realistic days, recover from missed tasks, build consistency through XP, unlock companion pets, and stay accountable with friends.

The goal is not just to be another to-do list. Daily Discipline combines task planning, AI coaching, focus sessions, rewards, reminders, and social accountability into one habit-building system.

## Highlights

- Natural-language AI task planning
- AI reality checks for overloaded days
- AI rescheduling suggestions for missed tasks
- AI daily feedback, pattern feedback, weekly review, and task breakdowns
- Today dashboard with readiness score, energy mode, recovery missions, and adaptive rescheduling
- Task scheduling for today, tomorrow, custom future dates, and recurring routines
- Ongoing routine loops such as "gym every day except Sunday" without creating huge batches of future tasks
- Routine dashboard with health score, AI coach, edit, skip-next, pause, and delete controls
- XP system with unlockable companion pets and custom pet sprites
- Pet Home with habitat selection and companion progress
- Focus Mode with Strict Focus app-switch strike tracking
- Extra XP for clean Strict Focus sessions
- Accountability friends, progress sharing, nudges, and friend challenges
- Stats dashboard with Discipline Score, weekly review, time-window analysis, and XP progress
- Month calendar and next-7-days planner
- Shareable daily progress card from the Summary screen
- Local notifications for task reminders, morning summaries, and evening planning
- Multiple themes, including light, dark, GitHub Dark, Amazon Light, Void Black, Slate Steel, and Rose Quartz
- Tester feedback, reminder health, data reset, and account deletion tools
- EAS build setup for internal testers
- Render/Docker setup for the AI backend

## Screens And Core Flows

### Today

The Today screen acts as the main command center. It shows the user's daily progress, XP, active companion, readiness score, missed-task recovery, energy mode, AI pattern coaching, future plans, and quick links to focus, week view, and summary.

### Add Task

Users can add tasks manually or type natural language such as:

```txt
Gym at 6 PM every day, study for 2 hours at 8 PM
```

The app can parse the text into structured tasks, detect recurrence, estimate duration, run a reality check, and schedule the tasks.

### Stats

The Stats screen shows Discipline Score, XP, streaks, weekly progress, time-window quality, plan-vs-reality data, task mix, AI weekly review, and next-week focus recommendations.

### Focus Mode

Focus Mode lets users start a timed focus session tied to a task. Strict Focus tracks app switches, pauses the timer when the user leaves the app, and resets after too many strikes. Clean strict sessions give extra XP.

### Friends

Users can add accountability friends by email, share daily progress, send check-ins, and start daily challenges such as a 5-win team push, no-skip pact, or high-priority rescue.

### Pet Home

Users unlock pets through XP and can choose an active companion. The Pet Home includes companion mood, bond progress, reward badges, pet collection, and habitat selection.

## AI Features

The app includes a FastAPI backend with Gemini/OpenAI support and local fallback logic.

The mobile app never stores a Gemini or OpenAI key. Expo only points to the
backend with `EXPO_PUBLIC_AI_API_URL`; the backend reads private keys from
`ai/.env` locally or from secret environment variables when deployed.

### Natural-Language Task Input

Turns messy text into scheduled tasks with:

- title
- date
- time
- priority
- duration estimate
- recurrence rule
- notes

Recurring tasks are stored as routine rules. For example, "go to the gym every
day except Sunday at 6 PM" becomes one ongoing routine that creates the next
needed task as the current one is completed or skipped, instead of dumping weeks
of duplicate tasks into the app.

### Reality Check

Checks whether a proposed plan is realistic before tasks are added. Energy Mode affects the warning threshold, so a Light Day warns sooner than a Locked In day.

### AI Reschedule

When tasks are missed, the app can suggest better times based on the remaining schedule.

### Pattern Feedback

Looks for repeated skips, weak time windows, reschedule friction, and stronger execution windows.

### Routine Coach

Reviews ongoing routines such as "Gym every day except Sunday" and suggests
whether to keep the time, make the routine smaller, skip one occurrence, or move
the weakest day. If Gemini/OpenAI is unavailable, the app still shows a local
coach based on completion, skipped, and rescheduled history.

### Daily Feedback

Generates a short end-of-day message based on actual completions, skips, pending tasks, and reschedules.

### Weekly Review

Creates a weekly coaching summary with wins, risks, and next-week focus items.

### Task Breakdown

Breaks large tasks like:

```txt
Study for biology exam
```

into smaller scheduled steps with time estimates.

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
- Render-ready Docker backend

## Project Structure

```txt
my-app/
  app/
    (tabs)/
      index.tsx        # Today dashboard
      explore.tsx      # Add Task and AI planner
      stats.tsx        # Stats, Discipline Score, weekly AI review
      settings.tsx     # Settings tab wrapper
      _layout.tsx      # Bottom tab navigation
    focus.tsx          # Focus Mode and Strict Focus
    friends.tsx        # Accountability friends and challenges
    pet-home.tsx       # Pet collection, bond, habitat
    summary.tsx        # Daily summary and AI feedback
    week.tsx           # Month calendar and next-7-days planner
    settings.tsx       # Full settings screen
    onboarding.tsx     # First-time onboarding
    tutorial.tsx       # In-app tutorial
    login.tsx
    signup.tsx

  ai/
    main.py            # FastAPI AI backend
    requirements.txt
    Dockerfile
    README.md

  assets/
    images/            # App icon, splash, favicon, cover assets
    pets/              # Companion pet PNGs

  components/
    ambient-background.tsx
    haptic-tab.tsx
    pet-sprite.tsx
    ui/

  constants/
    appTheme.ts
    firebaseConfig.ts
    rewards.ts
    theme.ts

  hooks/
    use-user-profile.ts

  utils/
    ai.ts
    notifications.ts
    task-helpers.ts

  docs/
    TESTER_HANDOFF.md

  firestore.rules
  firebase.json
  eas.json
  render.yaml
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Expo

```bash
npx expo start
```

Then scan the QR code with Expo Go or run on a simulator.

### 3. Run Quality Checks

```bash
npm run qa
```

This runs TypeScript checking and ESLint.

## Firebase Setup

The app uses Firebase Auth and Cloud Firestore.

Required Firebase features:

- Email/password authentication
- Cloud Firestore
- Firestore security rules from `firestore.rules`

Deploy Firestore rules with:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only firestore:rules
```

Friend requests, accountability nudges, friend challenges, public progress sharing, and widget summary data all depend on the latest rules being deployed.

## AI Backend Setup

The app works with local fallbacks, but the full AI features use the FastAPI backend in `ai/`.

### 1. Create A Python Environment

```bash
cd ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Add Environment Variables

Create `ai/.env`:

```env
AI_PROVIDER=auto
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3-flash-preview
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
AI_ALLOWED_ORIGINS=*
```

Keep Gemini/OpenAI keys only in the backend. The Expo app should only receive
`EXPO_PUBLIC_AI_API_URL`, never a provider key. If no model key is provided, the
backend still uses local fallback logic.

Provider behavior:

- `AI_PROVIDER=auto` uses Gemini first when `GEMINI_API_KEY` exists.
- If Gemini is not configured, the backend tries OpenAI when `OPENAI_API_KEY` exists.
- If neither key exists, the backend uses the built-in planner so the app still works.

When publishing or sharing the app, do not commit `ai/.env` and do not place
Gemini/OpenAI keys inside Expo `.env.local`, app code, GitHub, screenshots, or
EAS public variables.

### 3. Run The Backend

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or from the project root:

```bash
npm run ai:dev
```

### 4. Connect Expo To The Backend

For a physical phone, use your computer's local network IP instead of `localhost`:

```bash
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_IP:8000 npx expo start -c
```

For a deployed backend:

```bash
EXPO_PUBLIC_AI_API_URL=https://your-backend-url npx expo start -c
```

## AI Backend Endpoints

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

Before sending the app to testers:

```bash
npm run release:check
npm run deploy:rules
```

Create an internal EAS build:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform all
```

If using a deployed AI backend, add it as an EAS secret:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-backend-url
```

Tester instructions are in:

```txt
docs/TESTER_HANDOFF.md
docs/PRODUCTION_CHECKLIST.md
```

## Current Limitations

- Expo Go does not fully support production notification behavior. Use a development build for more realistic notification testing.
- Strict Focus cannot truly block other apps in Expo Go. It detects app switching, pauses the timer, and records strikes.
- The app writes widget-ready summary data, but a real iOS/Android home-screen widget still requires native widget work in a custom build.
- Friend features require the latest Firestore rules to be deployed.

## Roadmap Ideas

- Native home-screen widget
- Deeper friend challenge history
- More pet habitat unlocks
- Full native distraction blocking through platform-specific focus integrations
- Push notifications and cloud functions for friend nudges
- App Store / Play Store production release

## Purpose

Daily Discipline is designed to make productivity feel more personal, realistic, and rewarding. Instead of only tracking tasks, the app helps users understand their habits, recover from missed tasks, and build consistency over time.
