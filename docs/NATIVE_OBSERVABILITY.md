# Native Observability Upgrade

This app now has safe hooks for production observability without forcing native-only dependencies into Expo Go/tester workflows.

## Request Tracing

`utils/request-tracing.ts` creates:

- `X-Request-ID`
- `X-Client-Trace-ID`
- `traceparent`
- `X-App-Version`

`utils/ai.ts` attaches these headers to AI requests. `utils/analytics.ts` attaches them to analytics-event posts. The Go security gateway forwards `X-Request-ID`, `X-Client-Trace-ID`, and `traceparent` to the Python backend and writes request IDs into PostgreSQL audit logs.

This gives a clean path for debugging:

```txt
Crash Viewer requestId/traceId -> Go gateway audit log -> Python backend log
```

## App Check Client Hook

`utils/app-check.ts` looks for a native bridge:

```ts
globalThis.DailyDisciplineAppCheck = {
  async getToken(forceRefresh?: boolean) {
    return "firebase-app-check-token";
  },
};
```

When present, AI and analytics requests automatically include:

```txt
X-Firebase-AppCheck: <token>
```

For local gateway testing only, you can set:

```env
EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN=debug-token
```

Do not ship a public tester build with a real debug token committed or bundled.

## Safe Rollout

1. Keep `APP_CHECK_MODE=optional` in `render.yaml` for testers.
2. Add a native App Check provider in a development/custom build.
3. Confirm `X-Firebase-AppCheck` reaches the gateway in optional mode.
4. Deploy `render.production.yaml` or set `APP_CHECK_MODE=required`.
5. Confirm requests without App Check fail with `401` and are visible in audit logs.

## Crash Provider Hook

`utils/crash-provider.ts` looks for:

```ts
globalThis.DailyDisciplineCrashProvider = {
  configureScope(scope) {},
  captureException(error, context) {},
  captureMessage(message, context) {},
};
```

The existing Firestore/local Crash Viewer still works if no provider is installed. When a native provider is present, `reportAppError` forwards errors to it and still writes tester-visible diagnostics unless the user opted out.

## Sentry/Crashlytics Adapter Idea

A future Sentry adapter can be initialized near app startup, then expose the bridge above:

```ts
globalThis.DailyDisciplineCrashProvider = {
  configureScope(scope) {
    Sentry.setUser(scope.uid ? { id: scope.uid, email: scope.email ?? undefined } : null);
  },
  captureException(error, context) {
    Sentry.captureException(error, {
      level: context.severity === "fatal" ? "fatal" : "error",
      tags: {
        source: context.report.source,
        traceId: context.report.traceId,
        requestId: context.report.requestId,
      },
      extra: context.report,
    });
  },
};
```

The same shape can wrap Firebase Crashlytics in a native build.

## Sentry Setup Path

The app does not force Sentry into Expo Go, but the bridge is ready.

Recommended next implementation:

```bash
npx expo install @sentry/react-native
npx sentry-expo-upload-sourcemaps dist
```

Then initialize Sentry in a native/custom build startup file and expose:

```ts
globalThis.DailyDisciplineCrashProvider = {
  configureScope(scope) {
    Sentry.setUser(scope.uid ? { id: scope.uid, email: scope.email ?? undefined } : null);
  },
  captureException(error, context) {
    Sentry.captureException(error, {
      tags: {
        source: context.report.source,
        requestId: context.report.requestId,
        traceId: context.report.traceId,
      },
      extra: context.report,
    });
  },
};
```

Until then, Firestore-backed Crash Viewer remains active for tester diagnostics.
