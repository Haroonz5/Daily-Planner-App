# Testing And Release

Use this checklist when you are ready to let other people test Daily Discipline.

## 1. Local Smoke Test

```bash
npm install
npm run typecheck
npx eslint . --no-cache
npm run ai:dev
```

In another terminal:

```bash
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_LAN_IP:8000 npx expo start -c
```

Test on a real phone:

- Sign up and log in.
- Add a task manually.
- Use "Plan with AI" for multiple tasks.
- Complete, skip, and reschedule a task.
- Confirm task reminders are not duplicated.
- Open Today, Add Task, Stats, Summary, Focus, and Settings.

## 2. Deploy The AI Backend

The repo includes a Dockerfile for the AI service and a Render blueprint.

Render path:

```txt
render.yaml
```

Required environment variable:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Optional:

```env
OPENAI_MODEL=gpt-4o-mini
AI_ALLOWED_ORIGINS=*
```

After deployment, copy the public backend URL. It should respond at:

```txt
https://your-backend-url/health
```

## 3. Build Tester Apps With EAS

Install or run EAS:

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

Set the AI URL for builds:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-backend-url
```

Internal tester build:

```bash
npx eas-cli@latest build --profile preview --platform all
```

iOS simulator build:

```bash
npx eas-cli@latest build --profile simulator --platform ios
```

Production build:

```bash
npx eas-cli@latest build --profile production --platform all
```

## 4. Tester Notes

Ask testers to report:

- Device model and OS version.
- Whether reminders arrive once and at the expected time.
- Any screen that feels confusing.
- Any AI output that feels wrong or too generic.
- Screenshots of errors.

Start with 3-5 testers before sending it wider. Small testing groups catch the sharp edges without burying you in feedback.
