# Security Gateway Go Service

This service sits between the Expo app and the Python AI backend.

```txt
React Native app -> Go security gateway -> Python FastAPI AI backend
```

It is intentionally small but production-shaped:

- Verifies Firebase ID tokens when `SECURITY_AUTH_MODE=firebase`.
- Rate-limits requests by authenticated `uid`, falling back to IP when needed.
- Proxies AI requests to the Python backend.
- Writes security audit logs to PostgreSQL.
- Adds request IDs and forwards the authenticated UID to the upstream service.

## Run Locally

```bash
cd services/security-gateway
go run .
```

Local defaults:

```env
PORT=8020
AI_BACKEND_URL=http://127.0.0.1:8000
SECURITY_AUTH_MODE=dev
RATE_LIMIT_PER_MINUTE=60
UPSTREAM_TIMEOUT_SECONDS=8
DATABASE_URL=
FIREBASE_PROJECT_ID=
```

In dev mode, missing tokens are allowed and audit logs fall back to stdout if
`DATABASE_URL` is not configured. For production, use:

```env
SECURITY_AUTH_MODE=firebase
FIREBASE_PROJECT_ID=daily-planner-76712
DATABASE_URL=postgres://user:password@host:5432/database?sslmode=require
```

Then point the app at the gateway instead of the Python backend:

```env
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_IP:8020
```

## Endpoints

- `GET /health`
- Any `/v1/...` AI endpoint is proxied to the Python backend.

## PostgreSQL Audit Logs

Schema lives in `migrations/001_security_audit_logs.sql`.

Useful security queries:

```sql
SELECT *
FROM security_audit_logs
WHERE ip = '203.0.113.10'
ORDER BY created_at DESC;
```

```sql
SELECT ip, COUNT(*) AS failed_requests
FROM security_audit_logs
WHERE status >= 400
GROUP BY ip
ORDER BY failed_requests DESC;
```

```sql
SELECT uid, endpoint, COUNT(*) AS hits
FROM security_audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY uid, endpoint
ORDER BY hits DESC;
```
