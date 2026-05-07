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

Add a model provider key to `.env`. Gemini and OpenAI are both supported, and
the mobile app should never contain either key.

```env
AI_PROVIDER=auto
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3-flash-preview
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
AI_ALLOWED_ORIGINS=*
AI_TIMEOUT_SECONDS=5
```

With `AI_PROVIDER=auto`, the backend uses Gemini when `GEMINI_API_KEY` exists,
then OpenAI when `OPENAI_API_KEY` exists, then the built-in planner as a safe
fallback.

`AI_TIMEOUT_SECONDS` keeps model calls fast. If Gemini is slow, the backend
returns to the built-in planner quickly so the mobile app can still add tasks
without feeling stuck.

## Run

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

For the Expo app, set:

```bash
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_LAN_IP:8000 npx expo start -c
```

Use your Mac LAN IP when testing on a physical phone. `localhost` only works for simulators or the same machine.

## Deploy

The repository root includes:

```txt
render.yaml
ai/Dockerfile
```

Deploy the service, set `GEMINI_API_KEY` or `OPENAI_API_KEY` on the hosting
provider, then point the app at the deployed URL:

```bash
EXPO_PUBLIC_AI_API_URL=https://your-ai-backend npx expo start -c
```

## Endpoints

- `GET /health`
- `POST /v1/parse-tasks`
- `POST /v1/reality-check`
- `POST /v1/reschedule`
- `POST /v1/daily-feedback`
- `POST /v1/pattern-feedback`
- `POST /v1/weekly-review`
- `POST /v1/routine-coach`
- `POST /v1/breakdown-task`

If model keys are missing, the backend uses local fallbacks so development can
continue.

## API Key Safety

Keep provider keys in `ai/.env` locally or in your deployed backend's secret
environment variables. Do not put `GEMINI_API_KEY` or `OPENAI_API_KEY` in
Expo's `.env.local`, app code, screenshots, GitHub, or EAS public variables.
The app only needs `EXPO_PUBLIC_AI_API_URL`, which points to this backend.
