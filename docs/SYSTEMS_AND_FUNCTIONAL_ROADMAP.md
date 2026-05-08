# Systems and Functional Roadmap

This roadmap is for features that make Daily Discipline more useful while also
making the repository stronger for internships, backend roles, infra roles, and
security-adjacent reviews.

## Added Systems Depth

- Go stats aggregator: standalone microservice in `services/stats-aggregator/`.
- Go security gateway: auth, rate limiting, proxying, and audit logs before the AI backend.
- SQLite analytics: FastAPI endpoints for task events and completion-by-time SQL.
- PostgreSQL audit trail: request-level security table and analyst queries.
- Bash ops scripts: backend health checks and deploy-readiness flow.
- GitHub Actions: app QA, Python backend compile check, and Go service test.

## High-Value Functional Ideas

- Server-side reminder scheduler: move critical reminder calculations out of the app so notifications remain consistent across devices.
- Analytics dashboard endpoint: aggregate completion rate, skip rate, and time-window performance for the current user.
- Feature flags: safely roll out experiments like new XP formulas or stricter AI reality checks.
- Privacy export: one endpoint that returns the user's tasks, routines, XP, and friend/accountability data.
- Audit trail: record high-value events such as task completion, recurring routine deletion, and friend challenge actions.
- Offline sync queue: queue task changes locally and replay them once Firestore/backend access returns.
- Admin/tester feedback queue: collect tester notes, app version, device type, and the screen where feedback happened.
- Backend rate limits: protect AI endpoints from accidental spam and make the API safer to expose.
- Calendar sync worker: push tasks to Apple/Google Calendar through a backend job instead of only using export links.
- Notification reliability monitor: compare scheduled reminder counts with expected task counts and surface drift.

## Portfolio Story

The strongest story is not "I built a to-do app." It is:

> I built a mobile discipline app with Firebase auth/data, an AI planning backend,
> local-first fallbacks, a Go stats microservice, SQLite analytics, CI checks,
> and operational scripts for deployment readiness.

That shows frontend, mobile, AI integration, backend APIs, data modeling,
systems thinking, and production habits in one project.
