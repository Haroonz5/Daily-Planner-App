# Hosted Backend Deployment

This is the production-shaped path for testing Daily Discipline without keeping a laptop on all day.

## Recommended Hosted Shape

```mermaid
flowchart LR
  App["Expo preview/production app"] --> Gateway["Go security gateway"]
  Gateway --> AI["Python FastAPI AI backend"]
  Gateway --> Postgres[("PostgreSQL audit logs")]
  AI --> SQLite[("AI analytics SQLite disk")]
```

## Render Blueprint

The repo includes `render.yaml` with:

- `daily-discipline-ai` for the Python AI backend.
- `daily-discipline-security-gateway` for auth, rate limits, audit logs, and proxying.
- `daily-discipline-stats-aggregator` for the standalone Go stats service.
- `daily-discipline-postgres` for gateway audit logs.

Deploy steps:

1. Push the repo to GitHub.
2. In Render, create a new Blueprint from `render.yaml`.
3. Add these secret values in Render:
   - `GEMINI_API_KEY` or `OPENAI_API_KEY`
   - `ADMIN_DASHBOARD_TOKEN`
   - `SECURITY_ALLOWED_ORIGINS`
   - `AI_BACKEND_URL` pointing to the deployed Python AI service
4. Keep `SECURITY_AUTH_MODE=firebase` for tester builds.
5. Keep `APP_CHECK_MODE=optional` until the native app is sending App Check tokens.

## Expo Build Env

Set the mobile app to call the hosted Go gateway, not your laptop:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-gateway.onrender.com
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_REQUIRE_SECURE_AI --value true
```

Then build:

```bash
npm run eas:preview
```

## Local Full Stack

For local testing with Docker Desktop:

```bash
npm run stack:up
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_IP:8020 npx expo start -c
```

## Health Checks

```bash
curl https://your-ai.onrender.com/health
curl https://your-gateway.onrender.com/health
```

The app Settings screen also includes AI Backend Status, Admin Analytics, Demo Mode, Crash Viewer, and Privacy controls for tester validation.
