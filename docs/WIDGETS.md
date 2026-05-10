# Widget Support Plan

Daily Discipline now writes a small widget-ready summary to:

```text
users/{uid}/widgetSummary/today
```

The document contains:

- `today`
- `total`
- `completed`
- `open`
- `nextTask`
- `completionRate`
- `updatedAt`

The React Native app writes this from the Home screen, and the Cloud Functions scaffold can refresh it server-side after task changes. A real iOS widget would read this summary from an App Group or a tiny native bridge in a development/production build.

This keeps the feature resume-ready now while avoiding a brittle native widget implementation inside Expo Go.
