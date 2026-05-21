# Daily Discipline Native Focus Shield

This is the iOS Screen Time / FamilyControls scaffold for a true app-blocking focus mode.

Why it is separate:

- Expo Go cannot use FamilyControls or ManagedSettings.
- A production version needs a custom development client or bare/prebuilt iOS project.
- Apple requires the Family Controls entitlement and review justification.

Integration path:

1. Run `npx expo prebuild --platform ios`.
2. Add FamilyControls, ManagedSettings, and DeviceActivity capabilities in Xcode.
3. Request the Family Controls entitlement in Apple Developer.
4. Bridge `DailyDisciplineFocusShield` to React Native or call it from a native screen.
5. Replace the current Strict Focus strike detector with actual shield start/stop calls for selected apps.
