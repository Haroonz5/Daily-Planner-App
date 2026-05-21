# Observability And Logging

Daily Discipline now has several layers of visibility for local testing, hosted services, and interview demos.

## Request IDs

The Go security gateway creates or forwards `X-Request-ID` for each request. It sends that ID to the Python AI backend through `X-Request-ID`, and includes the same ID in the response.

Use this when debugging a slow or failed AI call:

```txt
Mobile app -> Go gateway audit log -> Python backend log
```

## Gateway Audit Logs

The security gateway writes every proxied request to PostgreSQL when `DATABASE_URL` is configured.

Stored fields include:

- request ID
- uid
- endpoint
- method
- ip
- status
- user agent
- latency
- failure reason
- timestamp

If `DATABASE_URL` is missing, audit events are still printed to stdout so local development remains easy.

## Admin Analytics Dashboard

Open the gateway dashboard:

```txt
https://your-gateway-url/admin
```

The dashboard calls `/admin/audit-summary` with `X-Admin-Token` and shows:

- total requests in the last 24 hours
- failed requests
- rate-limited requests
- average latency
- top endpoints
- suspicious IPs
- recent failures

Required env:

```env
ADMIN_DASHBOARD_TOKEN=long-random-secret
```

## App Error Viewer

The mobile app writes user-visible diagnostics into each user's Firestore `appErrors` collection unless crash reporting is disabled. The in-app Crash Viewer lets testers send useful bug reports without needing Xcode logs.

## AI Eval Report

The AI planner evaluation suite writes:

```txt
ai/evals/latest-report.json
```

Run:

```bash
npm run ai:eval
```

CI uploads the latest report as a GitHub Actions artifact.

## Load Testing

The k6 script lives at:

```txt
load/k6/gateway-load.js
```

Local gateway:

```bash
npm run load:gateway:local
```

Hosted gateway:

```bash
GATEWAY_URL=https://your-gateway-url ADMIN_DASHBOARD_TOKEN=token npm run load:gateway
```

The default thresholds are intentionally modest for starter hosting:

- request failure rate below 5%
- p95 latency below 1200ms

## Production Log Checklist

Before a tester push:

1. Confirm `/health` for AI backend and gateway.
2. Confirm gateway `audit_db` is `true`.
3. Run `npm run hosted:check` against the hosted gateway.
4. Open `/admin` and confirm audit summary loads.
5. Run the k6 smoke test.
6. Check mobile Settings > AI Backend Status.
7. Check Crash Viewer after a manual test pass.

## What To Add Later

- Sentry or Firebase Crashlytics for native crash aggregation.
- OpenTelemetry traces across Go and Python.
- Structured JSON logs in the Python backend.
- Push receipt polling for Expo ticket delivery outcomes.
- Alerting for high 401/429/5xx rates.
