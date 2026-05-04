# Daily Discipline Tester Handoff

Use this when you are ready to send a preview build to friends or early testers.

## Quick Tester Message

```txt
Hey, I am testing my productivity app Daily Discipline.

Please try:
- Sign up and complete the tutorial.
- Add one normal task.
- Add one repeating task like "Gym at 6 PM every day".
- Complete, skip, and reschedule a task.
- Add a friend by email from Settings > Accountability Friends.
- Try Focus Mode with Strict Focus turned on, then switch apps once.
- Check Settings > Routine Manager and Settings > Reminder Health.
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

Run the stronger device-readiness check:

```bash
npm run qa:device
```

Deploy Firestore rules after logging into Firebase:

```bash
npx firebase-tools@latest login
npm run deploy:rules
```

Create an internal tester build:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform all
```

If the AI backend is deployed, set it before building:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-backend-url
```

## Tester Pass Criteria

- New users see onboarding, signup, then the app tutorial.
- Today, Add Task, Stats, and Settings feel polished and do not look cramped.
- The Today screen loads cleanly and has a useful empty state.
- Repeating tasks appear in Settings > Routine Manager.
- Ending a routine removes open/future repeats but keeps completed history.
- Settings > Reminder Health shows scheduled reminders and duplicate status.
- Settings > Tester Feedback saves feedback successfully.
- Settings > Tester Data Controls can reset test data without deleting the login.
- AI Pattern Coach gives at least one useful next action after enough task history.
- Stats shows a Discipline Score Breakdown and AI Weekly Review.
- Friends can send requests, see daily progress, and send check-ins.
- Strict Focus pauses when the tester leaves the app and records a strike.
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
