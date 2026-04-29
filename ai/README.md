# Daily Discipline AI Backend

This FastAPI service powers natural-language task parsing, reality checks, and
AI-assisted rescheduling for the Expo app.

## Setup

```bash
cd ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Add your OpenAI API key to `.env`.

## Run

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

For the Expo app, set:

```bash
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_LAN_IP:8000 npx expo start -c
```

Use your Mac LAN IP when testing on a physical phone. `localhost` only works for simulators or the same machine.

## Endpoints

- `GET /health`
- `POST /v1/parse-tasks`
- `POST /v1/reality-check`
- `POST /v1/reschedule`
- `POST /v1/daily-feedback`
- `POST /v1/pattern-feedback`
- `POST /v1/weekly-review`
- `POST /v1/breakdown-task`

If `OPENAI_API_KEY` is missing, the backend uses local fallbacks so development
can continue.
