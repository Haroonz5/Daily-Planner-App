# Widget Support Plan

Daily Discipline writes a widget-ready summary to both local device storage and Firestore:

```text
users/{uid}/widgetSummary/today
AsyncStorage: daily-discipline.widget-summary.{uid}
```

The document contains:

- `date`
- `total`
- `completed`
- `open`
- `progressPercent`
- `nextTaskTitle`
- `nextTaskTime`
- `nextTaskDate`
- `nextTaskLabel`
- `smallWidgetLine`
- `lockScreenLine`
- `largeWidgetLines`
- `petName`
- `petKey`
- `readinessLabel`
- `readinessScore`
- `updatedAt` / `updatedAtIso`

The Today screen refreshes this summary whenever tasks, theme, pet, or readiness data changes. Settings links to `/widget-preview`, which renders the same payload as a lock-screen and large home-screen widget mock.

A real iOS widget would read the local summary through an App Group/native bridge in a development or production build. Android can use the same compact payload through a native widget provider. Keeping the payload small avoids querying Firestore from the widget itself and makes the feature safer for battery life.

## Native Widget Scaffold

Native WidgetKit source now lives in:

```text
native/ios-widget/DailyDisciplineWidget
```

When you are ready to create an iOS native target:

```bash
npx expo prebuild --platform ios
npm run widget:ios:prepare
```

Then finish the Widget Extension target and App Group setup in Xcode.
