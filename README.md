# Daily Discipline

Daily Discipline is a mobile productivity app built with Expo and React Native. It helps users plan tasks, stay realistic about their schedule, build consistency through XP, unlock companion pets, and use AI tools to turn messy plans into clear action.

## Features

- Create tasks for today, tomorrow, or a custom future date
- Schedule tasks with exact dates and times
- Mark tasks as completed, skipped, or rescheduled
- XP reward system based on task completion and priority
- Unlockable companion pets as consistency rewards
- Custom pet sprites instead of plain emojis
- Daily progress tracking and weekly stats
- Multiple app themes, including light and dark themes
- Cleaner floating bottom navigation
- Local notifications for task reminders
- Morning summary and evening planning reminders
- AI natural-language task input
- AI reality check for overloaded schedules
- AI rescheduling for missed tasks
- AI daily feedback based on actual completion
- AI task breakdown for large or vague tasks

## AI Features

The app includes a FastAPI backend for AI-powered productivity tools.

### Natural Language Task Input

Users can type something like:

```txt
Gym at 6 PM, study for 2 hours at 8 PM
```

The app turns that into structured tasks with dates, times, priorities, and estimated durations.

### Reality Check

Before adding tasks, the app checks if the day is becoming unrealistic.

Example:

```txt
You scheduled about 9 hours of work today. Consider trimming or moving a lower-priority task.
```

### AI Reschedule

When a task is missed, the app suggests a better time later in the day based on the remaining schedule.

### Daily Feedback

The summary screen gives personalized feedback based on completed, skipped, pending, and rescheduled tasks.

### Task Breakdown

Large tasks like:

```txt
Study for biology exam
```

can be broken into smaller scheduled steps.

## Tech Stack

- Expo
- React Native
- TypeScript
- Expo Router
- Firebase Authentication
- Cloud Firestore
- Expo Notifications
- AsyncStorage
- FastAPI
- Python
- OpenAI API with local fallbacks

## Project Structure

```txt
my-app/
  app/
    (tabs)/
      index.tsx        # Today screen
      explore.tsx      # Add Task screen
      stats.tsx        # Stats screen
      _layout.tsx      # Bottom tab navigation
    summary.tsx        # Daily summary and AI feedback
    settings.tsx
    login.tsx
    signup.tsx
    onboarding.tsx

  ai/
    main.py            # FastAPI AI backend
    requirements.txt
    README.md

  assets/
    images/
      pets/            # Companion pet sprites
      icon.png         # App icon

  components/
    ambient-background.tsx
    pet-sprite.tsx

  constants/
    appTheme.ts
    firebaseConfig.ts
    rewards.ts
    theme.ts

  hooks/
    use-user-profile.ts

  utils/
    ai.ts              # Frontend AI API client
    notifications.ts
    task-helpers.ts
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Expo App

```bash
npx expo start
```

Then scan the QR code with Expo Go.

## AI Backend Setup

### 1. Go to the AI Folder

```bash
cd ai
```

### 2. Create a Virtual Environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 4. Add Environment Variables

Create an `.env` file inside the `ai/` folder:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
AI_ALLOWED_ORIGINS=*
```

The app still has local fallbacks if no OpenAI key is provided.

### 5. Run the AI Server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 6. Connect Expo to the AI Backend

When testing on a physical phone, use your Mac’s local network IP instead of `localhost`.

Example:

```bash
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_IP:8000 npx expo start -c
```

## Available Scripts

```bash
npm run start
npm run ios
npm run android
npm run web
npm run typecheck
npm run lint
npm run ai:dev
```

## Current Status

The app currently supports task planning, reminders, AI scheduling tools, XP rewards, companion pets, multiple themes, and improved UI polish.

The next possible improvements would be:

- Pattern feedback
- Deeper pet progression
- Streak protection
- More companion customization
- Production deployment


## Purpose

Daily Discipline is designed to make productivity feel more personal, realistic, and rewarding. Instead of only tracking tasks, the app helps users understand their habits, recover from missed tasks, and build consistency over time.

