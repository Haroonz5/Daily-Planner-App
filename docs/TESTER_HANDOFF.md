# Daily Discipline Tester Handoff

Use this when you are ready to send a preview build to friends or early testers.

## Quick Tester Message

```txt
Hey, I am testing my productivity app Daily Discipline.

Please try:
- Sign up and complete the tutorial.
- Finish the Today screen Setup Quest.
- Add one normal task.
- Save one custom task template.
- Add one repeating task like "Gym at 6 PM every day".
- Add one ongoing routine like "Gym at 6 PM every day except Sunday".
- Complete, skip, and reschedule a task.
- Add a friend by username from Settings > Accountability Friends.
- Try Focus Mode with Strict Focus turned on, then switch apps once.
- Check Settings > AI Backend Status, Routine Manager, Reminder Health, Widget Preview, and Calendar Sync.
- Add one personal rule in Settings > AI Planning Rules, then plan another task.
- Set one Weekly Focus Goal and confirm it appears on Today.
- Tell me if anything feels confusing, slow, cramped, or annoying.

Please send:
- Your phone model and iOS/Android version.
- A screenshot of any error.
- Whether notifications arrived once, not twice.
- One thing you liked and one thing you would change.
```

## Build Commands

Run these before sharing:

```bash
npm run qa
```

Run the tester-safe readiness check. This does not require Docker or Firebase Blaze:

```bash
npm run tester:check
```

Run the stronger full release check when you want the extra device/config checks:

```bash
npm run release:check
```

Deploy Firestore rules after logging into Firebase:

```bash
npx firebase-tools@latest login
npm run deploy:rules
```

Create an internal tester build:

```bash
npx eas-cli@latest login
npm run tester:build
```

Platform-specific internal builds:

```bash
npm run tester:ios
npm run tester:android
```

TestFlight candidate:

```bash
npm run testflight:build
```

If the AI/security stack is deployed, point the app at the Go security gateway before building. Do not use your laptop IP for friend testers:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-security-gateway-url
```

The Python AI URL and Gemini/OpenAI keys stay on the backend host. The phone app should only know the public gateway URL. If you have not hosted the backend yet, the app still works with the built-in offline planner; Settings will show the AI backend as offline.

Cloud Functions note: Firebase Functions require the Blaze plan. `npm run functions:deploy` safely skips on Spark/free testing. Friend nudges still appear in-app without Functions; only server push nudge delivery waits for `npm run functions:deploy:blaze`.


## Account And Privacy Checks

- Try creating an account with a typo like `person@gmail.con`; the app should block it before Firebase sends a verification email.
- Usernames must be unique. If a tester chooses a taken username, signup should ask for another one.
- Friend discovery is username-first. Public profile and username records should not expose emails.
- Ask each tester to write down their username after signup so friends can add them without sharing emails.

## Tester Pass Criteria

- New users see onboarding, signup, then the app tutorial.
- Today shows a Setup Quest until first-run essentials are complete.
- Weekly Focus Goal can be saved from Settings and appears on Today.
- Today, Add Task, Stats, and Settings feel polished and do not look cramped.
- The Today screen loads cleanly and has a useful empty state.
- Repeating tasks appear in Settings > Routine Manager.
- Ending a routine removes open/future repeats but keeps completed history.
- Recurring tasks can skip one occurrence without ending the full routine.
- Ongoing routines keep one active next task, create the next occurrence after completion or skip, and can be canceled from Settings > Routine Manager with Cancel All.
- High-priority tasks ask for a quick honesty/proof note before completion.
- Week Planner shows a calendar-style future view and can sync individual tasks to the native phone calendar.
- Settings > Reminder Health shows scheduled reminders and duplicate status.
- Task notifications expose Complete, Snooze 15m, Tomorrow, and Skip actions in a development or preview build.
- New-user tutorial saves the user goal and tunes energy mode.
- Settings > Tester Feedback saves feedback successfully.
- Settings > Tester Data Controls can reset test data without deleting the login.
- AI Pattern Coach gives at least one useful next action after enough task history.
- Stats shows a Discipline Score Breakdown and AI Weekly Review.
- Friends can send requests, see daily progress, and send check-ins.
- Friends can see the accountability watchlist and nudge a specific open task.
- Strict Focus pauses when the tester leaves the app and records a strike.
- Focus Mode explains that true app blocking needs a custom/native build.
- AI task planning should either return model results quickly or fall back
  without making the Add Task screen feel frozen.
- Settings > AI Backend Status correctly shows live model, backend fallback, or offline planner state.
- Bottom tabs do not cover buttons at the bottom of any screen.
- Notification action buttons are tested from a development or preview build, not Expo Go.
- Completing a task from the notification updates Today, Stats, XP, and scheduled reminders.
- Focus Mode music starts, loops quietly, and stops when the session ends.
- Pet nicknames stay saved after changing tabs, closing the app, and reopening.
- Firestore rules are deployed before testing friends, nudges, challenges, feedback, and progress sharing.

## Known Testing Notes

- AI has local fallbacks, so the app should still work if the backend is offline.
- Push-style local notifications require permission on the device.
- Strict Focus cannot truly block other apps in Expo Go. It detects app switching,
  pauses the timer, and counts strikes instead.
- Start with 3 to 5 testers before widening the group.
