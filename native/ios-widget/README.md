# Daily Discipline iOS Widget Extension

This folder contains the native WidgetKit source for the next production step.

The Expo app already writes a compact widget summary from `utils/widget-summary.ts`.
A production iOS build should bridge that JSON into this App Group key:

```text
App Group: group.com.haroonzaman.dailydiscipline
UserDefaults key: dailyDisciplineWidgetSummary
```

Manual Xcode integration after `npx expo prebuild --platform ios`:

1. Open `ios/DailyDiscipline.xcworkspace`.
2. Add a Widget Extension target named `DailyDisciplineWidget`.
3. Copy `DailyDisciplineWidget.swift`, `DailyDisciplineWidgetBundle.swift`, and `Info.plist` into the target.
4. Enable the App Group on both the app target and widget target.
5. Add the widget target to the app build phases.

I kept this scaffold outside `app.json` so normal EAS preview builds do not fail before the Apple App Group is configured in the developer account.
