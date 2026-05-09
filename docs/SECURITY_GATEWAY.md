# Security Gateway Architecture

The security gateway adds a production-style boundary in front of the Python AI
backend.

```txt
Expo app
  |
  | Authorization: Bearer <Firebase ID token>
  | X-Firebase-AppCheck: <optional App Check token>
  v
Go security gateway
  |
  | X-Authenticated-Uid, X-Request-ID
  v
Python AI backend
```

## Responsibilities

- Verify Firebase ID tokens in production mode.
- Verify Firebase App Check tokens when `APP_CHECK_MODE=optional` or `required`.
- Rate-limit AI calls by authenticated `uid`, falling back to IP.
- Apply a stricter `AI_RATE_LIMIT_PER_MINUTE` to model-heavy `/v1/...` endpoints.
- Restrict browser origins with `SECURITY_ALLOWED_ORIGINS` instead of allowing every origin in production.
- Proxy AI requests to FastAPI.
- Write every request to PostgreSQL for auditability.
- Preserve a request ID across the boundary for debugging.

## PostgreSQL Table

The migration is in:

```txt
services/security-gateway/migrations/001_security_audit_logs.sql
```

Columns include:

- `uid`
- `endpoint`
- `method`
- `ip`
- `status`
- `user_agent`
- `latency_ms`
- `reason`
- `created_at`

## Security Analyst Queries

Suspicious IP:

```sql
SELECT *
FROM security_audit_logs
WHERE ip = '203.0.113.10'
ORDER BY created_at DESC;
```

Top failed IPs:

```sql
SELECT ip, COUNT(*) AS failed_requests
FROM security_audit_logs
WHERE status >= 400
GROUP BY ip
ORDER BY failed_requests DESC;
```

Most active users in the last hour:

```sql
SELECT uid, endpoint, COUNT(*) AS hits
FROM security_audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY uid, endpoint
ORDER BY hits DESC;
```

Rate-limit pressure:

```sql
SELECT uid, ip, COUNT(*) AS limited_requests
FROM security_audit_logs
WHERE status = 429
GROUP BY uid, ip
ORDER BY limited_requests DESC;
```

## Local vs Production

Local dev can use:

```env
SECURITY_AUTH_MODE=dev
APP_CHECK_MODE=off
SECURITY_ALLOWED_ORIGINS=*
DATABASE_URL=
```

Production should use:

```env
SECURITY_AUTH_MODE=firebase
FIREBASE_PROJECT_ID=daily-planner-76712
APP_CHECK_MODE=optional
SECURITY_ALLOWED_ORIGINS=https://your-app-domain.example.com
AI_RATE_LIMIT_PER_MINUTE=20
DATABASE_URL=postgres://user:password@host:5432/database?sslmode=require
```

Move `APP_CHECK_MODE` from `optional` to `required` only after the mobile app is
configured to send valid Firebase App Check tokens. Until then, optional mode
lets the gateway verify tokens when present without breaking Expo Go testing.
