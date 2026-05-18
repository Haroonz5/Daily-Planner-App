type FeatureFlagName =
  | "enableAiPlanner"
  | "enableFriends"
  | "enableDiagnostics"
  | "enableIdleSounds"
  | "enableSoundFx"
  | "enableTesterTools"
  | "enableSecureAiGateway"
  | "enableFeatureFlagPanel";

const envEnabled = (value: string | undefined, defaultValue = true) => {
  if (value === undefined) return defaultValue;
  return value !== "false" && value !== "0";
};

export const featureFlags: Record<FeatureFlagName, boolean> = {
  // I added these flags so portfolio/tester builds can turn advanced systems on
  // or off without deleting code. It keeps risky demos easy to isolate.
  enableAiPlanner: envEnabled(process.env.EXPO_PUBLIC_ENABLE_AI_PLANNER),
  enableFriends: envEnabled(process.env.EXPO_PUBLIC_ENABLE_FRIENDS),
  enableDiagnostics: envEnabled(process.env.EXPO_PUBLIC_ENABLE_DIAGNOSTICS),
  enableIdleSounds: envEnabled(process.env.EXPO_PUBLIC_ENABLE_IDLE_SOUNDS),
  enableSoundFx: envEnabled(process.env.EXPO_PUBLIC_ENABLE_SOUND_FX),
  enableTesterTools: envEnabled(process.env.EXPO_PUBLIC_ENABLE_TESTER_TOOLS),
  enableSecureAiGateway: envEnabled(
    process.env.EXPO_PUBLIC_ENABLE_SECURE_AI_GATEWAY
  ),
  enableFeatureFlagPanel: envEnabled(
    process.env.EXPO_PUBLIC_ENABLE_FEATURE_FLAG_PANEL,
    false
  ),
};

export const getEnabledFeatureFlags = () =>
  Object.entries(featureFlags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name as FeatureFlagName);
