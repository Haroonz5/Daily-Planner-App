export type Priority = "Low" | "Medium" | "High";
export type TaskStatus = "pending" | "completed" | "skipped";

export type RewardTask = {
  completed: boolean;
  status?: TaskStatus;
  priority?: Priority;
  completedAt?: any;
  rescheduledCount?: number;
  originalTime?: string;
  time?: string;
  date: string;
};

export type PetTier = {
  key: string;
  name: string;
  emoji: string;
  unlockXp: number;
  description: string;
};

export const PET_TIERS: PetTier[] = [
  {
    key: "rabbit",
    name: "Rabbit",
    emoji: "🐇",
    unlockXp: 0,
    description: "Quick starts. Fragile consistency.",
  },
  {
    key: "cat",
    name: "Cat",
    emoji: "🐈",
    unlockXp: 150,
    description: "More independent. More reliable.",
  },
  {
    key: "fox",
    name: "Fox",
    emoji: "🦊",
    unlockXp: 400,
    description: "Sharper planning. Better follow-through.",
  },
  {
    key: "wolf",
    name: "Wolf",
    emoji: "🐺",
    unlockXp: 800,
    description: "Disciplined under pressure.",
  },
  {
    key: "tiger",
    name: "Tiger",
    emoji: "🐅",
    unlockXp: 1400,
    description: "High standard. Strong execution.",
  },
  {
    key: "eagle",
    name: "Eagle",
    emoji: "🦅",
    unlockXp: 2200,
    description: "Sees the whole day clearly.",
  },
  {
    key: "dragon",
    name: "Dragon",
    emoji: "🐉",
    unlockXp: 3200,
    description: "Elite discipline. Hard to shake.",
  },
];

export const priorityXp: Record<Priority, number> = {
  Low: 10,
  Medium: 15,
  High: 25,
};

export const skipPenalty: Record<Priority, number> = {
  Low: 3,
  Medium: 5,
  High: 8,
};

export const parseTimeToMinutes = (time: string) => {
  const parts = time.split(" ");
  if (parts.length !== 2) return null;

  const [timePart, period] = parts;
  const [hoursStr, minutesStr] = timePart.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  let normalizedHours = hours;
  if (period === "PM" && hours !== 12) normalizedHours += 12;
  if (period === "AM" && hours === 12) normalizedHours = 0;

  return normalizedHours * 60 + minutes;
};

export const toDateSafe = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const scheduledDateTime = (date: string, time: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const minutes = parseTimeToMinutes(time);
  if (!year || !month || !day || minutes === null) return null;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(year, month - 1, day, hours, mins, 0, 0);
};

export const getTaskXp = (task: RewardTask) => {
  const priority = task.priority ?? "Medium";

  if (!task.completed) return 0;

  let xp = priorityXp[priority];

  const completedAt = toDateSafe(task.completedAt);
  const plannedAt = scheduledDateTime(task.date, task.originalTime ?? task.time ?? "");

  if (completedAt && plannedAt) {
    const delayMinutes = Math.round(
      (completedAt.getTime() - plannedAt.getTime()) / 60000
    );

    if (delayMinutes <= 0) xp += 8;
    else if (delayMinutes <= 15) xp += 5;
    else if (delayMinutes <= 60) xp += 2;
  }

  xp -= Math.min((task.rescheduledCount ?? 0) * 2, 8);
  return Math.max(5, xp);
};

export const getCurrentPet = (xp: number) => {
  const safeXp = Math.max(0, xp);
  return PET_TIERS.reduce((current, tier) => {
    return tier.unlockXp <= safeXp ? tier : current;
  }, PET_TIERS[0]);
};

export const getPetByKey = (key?: string | null) =>
  PET_TIERS.find((tier) => tier.key === key) ?? null;

export const getUnlockedPets = (xp: number) => {
  const safeXp = Math.max(0, xp);
  return PET_TIERS.filter((tier) => tier.unlockXp <= safeXp);
};

export const getActivePet = (xp: number, preferredKey?: string | null) => {
  const unlockedPets = getUnlockedPets(xp);
  const preferredPet = unlockedPets.find((tier) => tier.key === preferredKey);
  return preferredPet ?? unlockedPets[unlockedPets.length - 1] ?? PET_TIERS[0];
};

export const getNextPet = (xp: number) => {
  const safeXp = Math.max(0, xp);
  return PET_TIERS.find((tier) => tier.unlockXp > safeXp) ?? null;
};

export const getPetProgress = (xp: number) => {
  const safeXp = Math.max(0, xp);
  const currentPet = getCurrentPet(safeXp);
  const nextPet = getNextPet(safeXp);

  if (!nextPet) {
    return {
      currentPet,
      nextPet: null,
      progressPercent: 100,
      remainingXp: 0,
      currentPetXp: safeXp,
      nextPetXp: safeXp,
    };
  }

  const span = nextPet.unlockXp - currentPet.unlockXp;
  const earned = safeXp - currentPet.unlockXp;
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round((earned / span) * 100))
  );

  return {
    currentPet,
    nextPet,
    progressPercent,
    remainingXp: nextPet.unlockXp - safeXp,
    currentPetXp: currentPet.unlockXp,
    nextPetXp: nextPet.unlockXp,
  };
};

export const getLevelData = (xp: number) => {
  const safeXp = Math.max(0, xp);
  const level = Math.floor(safeXp / 100) + 1;
  const currentLevelBase = (level - 1) * 100;
  const currentLevelProgress = safeXp - currentLevelBase;
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round((currentLevelProgress / 100) * 100))
  );

  return {
    level,
    currentLevelProgress,
    progressPercent,
    nextLevelXp: level * 100,
  };
};

export const getDisciplineLabel = (score: number) => {
  if (score >= 85) return "Locked In";
  if (score >= 70) return "Consistent";
  if (score >= 55) return "Building";
  return "Resetting";
};
