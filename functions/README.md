# Daily Discipline Cloud Functions

This folder is the production-style automation layer for the app.

## Functions

- `updateWidgetSummaryOnTaskWrite`: refreshes `users/{uid}/widgetSummary/today` when tasks change.
- `refillRollingRoutines`: scheduled routine refill that creates the next task for ongoing routines.

## Local Check

```bash
cd functions
npm install
npm run lint
```

## Deploy

```bash
npm run functions:deploy
```

The mobile app still has local fallback logic, so these functions improve reliability without making the app unusable during development.
