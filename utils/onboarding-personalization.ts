import AsyncStorage from "@react-native-async-storage/async-storage";

export type OnboardingPlanningGoal =
  | "school"
  | "fitness"
  | "work"
  | "discipline"
  | "wellness";

export type OnboardingExperience = "beginner" | "steady" | "intense";

export type OnboardingPersonalization = {
  planningGoal: OnboardingPlanningGoal;
  onboardingExperience: OnboardingExperience;
};

const ONBOARDING_PERSONALIZATION_KEY = "onboardingPersonalization";

const defaultPersonalization: OnboardingPersonalization = {
  planningGoal: "discipline",
  onboardingExperience: "steady",
};

export const saveOnboardingPersonalization = async (
  personalization: OnboardingPersonalization
) => {
  await AsyncStorage.setItem(
    ONBOARDING_PERSONALIZATION_KEY,
    JSON.stringify(personalization)
  );
};

export const getOnboardingPersonalization = async () => {
  const raw = await AsyncStorage.getItem(ONBOARDING_PERSONALIZATION_KEY);
  if (!raw) return defaultPersonalization;

  try {
    return {
      ...defaultPersonalization,
      ...(JSON.parse(raw) as Partial<OnboardingPersonalization>),
    };
  } catch {
    return defaultPersonalization;
  }
};

export const getPlanningRuleSeed = ({
  planningGoal,
  onboardingExperience,
}: OnboardingPersonalization) => {
  const goalRule = {
    school: "Prioritize school tasks before entertainment and keep study blocks before 9 PM.",
    fitness: "Protect workout time and keep recovery tasks realistic.",
    work: "Batch work tasks into focused blocks with buffer between meetings.",
    discipline: "Keep one hard task, one easy win, and one honest cutoff each day.",
    wellness: "Keep plans lighter, protect sleep, and include recovery tasks.",
  }[planningGoal];

  const intensityRule = {
    beginner: "Start with fewer tasks until the habit loop feels stable.",
    steady: "Use a balanced plan with one priority anchor per day.",
    intense: "Allow harder plans, but flag overload before the day starts.",
  }[onboardingExperience];

  return `${goalRule} ${intensityRule}`;
};
