# Stats Aggregator Go Service

This is a small standalone Go microservice that sits next to the Python AI
backend. It shows a systems/backend slice of the project: append-only event
ingestion, lightweight aggregation, health checks, and simple operational
configuration.

The app does not require this service to run. It is intentionally separate so
the mobile app and Python AI backend stay stable while the repo demonstrates Go.

## Run

```bash
cd services/stats-aggregator
go run .
```

Defaults:

```env
PORT=8010
STATS_DATA_FILE=data/task-events.jsonl
```

## Endpoints

- `GET /health`
- `POST /v1/events`
- `GET /v1/completion-rate?start_date=2026-05-01&end_date=2026-05-08`

Example event:

```bash
curl -X POST http://localhost:8010/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "user_hash": "demo-user",
    "event_type": "completed",
    "title": "Gym",
    "date": "2026-05-08",
    "time": "6:00 PM",
    "priority": "High",
    "completed": true,
    "status": "completed"
  }'
```

## Why This Exists

The Python backend is best for AI orchestration. This Go service is better as a
tiny infra-style worker: fast startup, simple memory profile, and clean JSON
APIs. A recruiter scanning the repo can see backend breadth without needing to
run the entire mobile app.
