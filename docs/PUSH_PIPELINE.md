# Push Notification Pipeline

Daily Discipline now has a production-shaped push pipeline that does more than local Expo reminders.

## What Sends Pushes

### 1. Device-local reminders

The mobile app schedules local reminders with `expo-notifications` for task due times, missed-task follow-ups, morning summaries, and evening planning prompts. These work best in a preview/development build because Expo Go has notification limitations.

### 2. Cloud task due reminders

`functions/index.js` includes `sendDueTaskPushReminders`, a scheduled Firebase Cloud Function that runs every 5 minutes in `America/New_York`.

It scans task docs for:

- `date` equal to today.
- `completed` equal to `false`.
- `status` not equal to `skipped`.
- a task time inside the reminder window.
- no existing `duePushSentAt` field.

Then it loads the user profile, reads `expoPushToken`, sends through Expo Push API, writes task delivery fields, and stores a receipt in `users/{uid}/pushReceipts`.

### 3. Friend/accountability nudges

`sendPushOnAccountabilityNudge` listens for new `accountabilityNudges/{nudgeId}` docs. When a friend sends a nudge, the function attempts a push notification and records the result.

## Receipt Storage

Receipts are stored under:

```txt
users/{uid}/pushReceipts/{receiptId}
```

Each receipt includes:

- `type`
- `status`
- `reason`
- `tokenSuffix`
- `title`
- `body`
- `data`
- `createdAt`

Firestore rules let the owner read/delete receipts but block client create/update. Cloud Functions use Admin SDK, so receipt writes bypass client rules safely.

## Why This Is Safer

- The app can still work offline with local reminders.
- Backend pushes are auditable through receipts.
- Duplicate due-task pushes are avoided with `duePushSentAt`.
- Invalid or missing Expo tokens become `not-sent` receipts instead of crashes.
- Push delivery failures do not block the app UI.

## Deploy

Rules:

```bash
npm run deploy:rules
```

Functions require Firebase Blaze:

```bash
npm run functions:deploy:blaze
```

If the Firebase project is still on Spark/free tier, the app continues to work without Cloud Functions, but server-side task due reminders and friend push nudges will not run.

## Manual QA

1. Create a preview/dev build, not Expo Go.
2. Sign in and allow notifications.
3. Confirm the user profile has `expoPushToken`.
4. Create a task due within the next 8 minutes.
5. Wait for the scheduled function window.
6. Confirm `duePushStatus` and a `pushReceipts` doc appear.
7. Send a friend nudge and confirm the recipient receives a push or a `not-sent` receipt.

## Current Limits

- Expo Push API is used directly; production scale should later add push-ticket receipt polling.
- Scheduled task reminders use a short lookahead window and today-only query to keep reads controlled.
- Real notification action handling from the lock screen still depends on native build behavior.
