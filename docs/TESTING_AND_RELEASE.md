# Testing And Release

Use this checklist when you are ready to let other people test Daily Discipline.

## 1. Local Smoke Test

```bash
npm install
npm run qa:device
npm run ai:dev
```

In another terminal, use your Mac LAN IP only for local testing:

```bash
EXPO_PUBLIC_AI_API_URL=http://YOUR_MAC_LAN_IP:8020 npx expo start -c
```

For testers outside your Wi-Fi, deploy the Python AI backend and Go security gateway first, then use the hosted gateway URL in EAS.

Test on a real phone:

- Sign up and log in.
- Confirm Today shows the Setup Quest for a fresh account.
- Open Settings > Account Security and confirm password reset sends.
- Add a task manually.
- Save and reuse one task template.
- Use "Plan with AI" for multiple tasks.
- Check Settings > AI Backend Status.
- Complete, skip, and reschedule a task.
- Confirm task reminders are not duplicated.
- Open Today, Add Task, Stats, Summary, Focus, and Settings.

## 2. Account Signup Checks

Before inviting testers, create two fresh accounts yourself:

- Use a typo email such as `tester@gmail.con`; signup should reject it before sending verification.
- Use a real email and a new username; signup should create the account, reserve the username, and show Verify Email.
- Try the same username on another account; signup should say the username is taken.
- Add friends by username only. Emails should not appear in public profile lookup.

## 3. Real Device Final Pass

Expo Go is good for layout and most app behavior, but notification action buttons,
background delivery, and the full sound/haptic experience need a development,
preview, or production build.

Before sending a tester build:

```bash
npm run tester:check
npm run deploy:rules
```

Cloud Functions are optional. `npm run functions:deploy` safely skips on Spark/free Firebase. Only run `npm run functions:deploy:blaze` after upgrading Firebase to Blaze.

Also walk through `docs/PRODUCTION_CHECKLIST.md` before widening the tester
group.

Then confirm:

- A task reminder appears once and shows Complete, Snooze, Tomorrow, and Skip actions.
- Tapping Complete from the notification marks the task complete in the app.
- Tapping Skip from the notification keeps the task in history as skipped.
- Settings can export the next 30 days of active tasks to the phone calendar.
- Focus Mode music starts, loops quietly, and stops when the session ends.
- Pet names stay saved after changing tabs and reopening the app.
- Weekly Focus Goal saves in Settings and appears on Today.
- Friends, accountability nudges, challenges, feedback, and progress sharing do not show permission errors.
- Optional: enable authenticator-app 2FA in Settings, then confirm login asks for the code.

## 4. Deploy The AI Backend

The repo includes a Dockerfile for the AI service and a Render blueprint.

Render path:

```txt
render.yaml
```

Required environment variable for model-powered AI:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Optional:

```env
AI_PROVIDER=auto
GEMINI_MODEL=gemini-3-flash-preview
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
AI_ALLOWED_ORIGINS=*
AI_TIMEOUT_SECONDS=5
```

Keep model timeouts short during testing. If Gemini is slow, the app should fall
back quickly instead of making the Add Task screen feel frozen.

After deployment, copy the public AI backend URL. It should respond at:

```txt
https://your-ai-backend-url/health
```

Then deploy the Go security gateway with `AI_BACKEND_URL` pointing at that Python backend. The app should call the gateway, not the Python service directly.

## 5. Build Tester Apps With EAS

Install or run EAS:

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

Set the AI URL for builds to the Go security gateway URL:

```bash
npx eas-cli@latest secret:create --scope project --name EXPO_PUBLIC_AI_API_URL --value https://your-security-gateway-url
```

Internal tester build:

```bash
npm run tester:build
```

iOS simulator build:

```bash
npx eas-cli@latest build --profile simulator --platform ios
```

Production build:

```bash
npx eas-cli@latest build --profile production --platform all
```

## 6. Tester Notes

Ask testers to report:

- Device model and OS version.
- Whether reminders arrive once and at the expected time.
- Any screen that feels confusing.
- Any AI output that feels wrong or too generic.
- Whether adding friends by username works cleanly.
- Whether AI planning feels fast enough or falls back clearly.
- Screenshots of errors.

Start with 3-5 testers before sending it wider. Small testing groups catch the sharp edges without burying you in feedback.
