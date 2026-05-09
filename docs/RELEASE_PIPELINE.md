# Release Pipeline

Use this when Daily Discipline is ready for a friend build, TestFlight build, or
portfolio demo.

## 1. Run The Full Local Gate

```bash
npm run release:full-check
```

This runs:

- Expo app typecheck, lint, dependency, and config checks.
- Secret scan for model keys, service accounts, and database URLs.
- Go tests for the security gateway.
- Go tests for the stats service.

## 2. Deploy Firestore Rules

```bash
npm run deploy:rules
```

Do this after changing friends, usernames, tester feedback, challenges, or
public profile behavior.

## 3. Check Backend Health

Local secure stack:

```bash
npm run dev:secure
```

Manual URLs:

```txt
http://127.0.0.1:8000/health
http://127.0.0.1:8020/health
http://127.0.0.1:8020/admin
```

The admin dashboard requires `ADMIN_DASHBOARD_TOKEN` when reading audit data.
`npm run dev:secure` uses `local-dev-admin` by default. Without `DATABASE_URL`,
audit logs still print to stdout and the dashboard will show that the audit
database is not connected.

## 4. Create Tester Builds

Preview build:

```bash
npm run eas:preview
```

iOS TestFlight style build:

```bash
npm run eas:testflight
```

Production build for both stores:

```bash
npm run eas:production
```

## 5. Device Smoke Test

Before sending the build out:

- Sign up with a fresh account.
- Verify email or use the test-only skip.
- Add a username and friend another test account.
- Add a manual task and an AI routine like `gym every day except Sunday at 6 PM`.
- Complete, skip, snooze, and delete a task.
- Export the next 30 days to calendar from Settings.
- Confirm lock-screen notification actions show Complete, Snooze, and Skip.
- Open Settings and confirm AI Backend Status, Reminder Health, and Account Security work.

## 6. Release Notes Template

```txt
Daily Discipline build YYYY.MM.DD

New:
- 

Fixed:
- 

Tester focus:
- 

Known limits:
- Expo Go still does not represent final notification behavior.
- Strict Focus tracks app switching but does not fully block apps without native integrations.
```
