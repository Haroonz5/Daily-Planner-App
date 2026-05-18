import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";

export type FeedbackPreferences = {
  soundEnabled?: boolean | null;
  hapticsEnabled?: boolean | null;
  calmFocusMusicEnabled?: boolean | null;
};

type AppSound = "taskComplete" | "petUnlock" | "idleNudge" | "softConfirm";

const soundSources: Record<AppSound, number> = {
  taskComplete: require("../assets/sounds/task-complete.wav"),
  petUnlock: require("../assets/sounds/pet-unlock.wav"),
  idleNudge: require("../assets/sounds/pet-unlock.wav"),
  softConfirm: require("../assets/sounds/task-complete.wav"),
};

const calmFocusLoop = require("../assets/sounds/calm-focus-loop.wav");

let activeAmbientSound: Audio.Sound | null = null;

const hapticsAllowed = (preferences?: FeedbackPreferences) =>
  preferences?.hapticsEnabled !== false;

const soundsAllowed = (preferences?: FeedbackPreferences) =>
  preferences?.soundEnabled !== false;

const calmMusicAllowed = (preferences?: FeedbackPreferences) =>
  preferences?.calmFocusMusicEnabled !== false;

const prepareAudio = async () => {
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });
};

export const playAppSound = async (
  sound: AppSound,
  preferences?: FeedbackPreferences,
  volume = 0.58
) => {
  if (!soundsAllowed(preferences)) return;

  try {
    await prepareAudio();
    const { sound: playback } = await Audio.Sound.createAsync(
      soundSources[sound],
      {
        shouldPlay: true,
        volume,
      }
    );

    playback.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        playback.unloadAsync().catch(() => {});
      }
    });
  } catch {
    // Audio should never block task completion or focus flow.
  }
};

export const playSelectionFeedback = async (
  preferences?: FeedbackPreferences
) => {
  if (!hapticsAllowed(preferences)) return;
  await Haptics.selectionAsync().catch(() => {});
};

export const playWarningFeedback = async (
  preferences?: FeedbackPreferences
) => {
  if (!hapticsAllowed(preferences)) return;
  await Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Warning
  ).catch(() => {});
};

export const playSaveFeedback = async (preferences?: FeedbackPreferences) => {
  // I added this lighter save feedback for settings/templates so small wins feel
  // responsive without sounding as big as completing a task.
  if (hapticsAllowed(preferences)) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
};

export const playTaskCreatedFeedback = async (
  preferences?: FeedbackPreferences
) => {
  // This sits between a tiny settings save and a full completion celebration:
  // adding a task should feel confirmed, but not as loud as finishing one.
  if (hapticsAllowed(preferences)) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await Haptics.selectionAsync().catch(() => {});
  }

  await playAppSound("softConfirm", preferences, 0.3);
};

export const playAiPreviewFeedback = async (
  preferences?: FeedbackPreferences
) => {
  // I added this for AI drafts so users get a small sensory cue that the plan is
  // ready to review before it is actually saved.
  if (hapticsAllowed(preferences)) {
    await Haptics.selectionAsync().catch(() => {});
  }

  await playAppSound("idleNudge", preferences, 0.2);
};

export const playIdleNudgeFeedback = async (
  preferences?: FeedbackPreferences
) => {
  // A very quiet idle cue after a few untouched minutes. It respects Settings,
  // so users can turn it off with the normal sound toggle.
  if (hapticsAllowed(preferences)) {
    await Haptics.selectionAsync().catch(() => {});
  }

  await playAppSound("idleNudge", preferences, 0.16);
};

export const playShareFeedback = async (preferences?: FeedbackPreferences) => {
  // This connects the Summary share card to the same sound/haptic preferences
  // the user controls in Settings.
  if (hapticsAllowed(preferences)) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await Haptics.selectionAsync().catch(() => {});
  }

  await playAppSound("petUnlock", preferences, 0.28);
};

export const playRoutineFeedback = async (
  preferences?: FeedbackPreferences
) => {
  // Routine actions are important but not task completions, so this uses a
  // quieter version of the completion sound and a medium tap.
  if (hapticsAllowed(preferences)) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => {}
    );
  }

  await playAppSound("taskComplete", preferences, 0.34);
};

export const playTaskCompleteFeedback = async (
  preferences?: FeedbackPreferences
) => {
  if (hapticsAllowed(preferences)) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => {}
    );
    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    ).catch(() => {});
  }

  await playAppSound("taskComplete", preferences, 0.62);
};

export const playPetUnlockFeedback = async (
  preferences?: FeedbackPreferences
) => {
  if (hapticsAllowed(preferences)) {
    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    ).catch(() => {});
  }

  await playAppSound("petUnlock", preferences, 0.56);
};

export const startCalmFocusMusic = async (
  preferences?: FeedbackPreferences
) => {
  if (!soundsAllowed(preferences) || !calmMusicAllowed(preferences)) return;

  try {
    await stopCalmFocusMusic();
    await prepareAudio();

    const { sound } = await Audio.Sound.createAsync(calmFocusLoop, {
      isLooping: true,
      shouldPlay: true,
      volume: 0.2,
    });

    activeAmbientSound = sound;
  } catch {
    activeAmbientSound = null;
  }
};

export const stopCalmFocusMusic = async () => {
  if (!activeAmbientSound) return;

  const sound = activeAmbientSound;
  activeAmbientSound = null;

  await sound.stopAsync().catch(() => {});
  await sound.unloadAsync().catch(() => {});
};
