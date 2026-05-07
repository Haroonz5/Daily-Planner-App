export type DisciplineQuoteMood =
  | "startup"
  | "momentum"
  | "skip"
  | "focus"
  | "review";

export type DisciplineQuote = {
  text: string;
  author: string;
  mood: DisciplineQuoteMood[];
};

const disciplineQuotes: DisciplineQuote[] = [
  {
    text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    author: "Aristotle, often paraphrased by Will Durant",
    mood: ["startup", "momentum", "review"],
  },
  {
    text: "Success is nothing more than a few simple disciplines, practiced every day.",
    author: "Jim Rohn",
    mood: ["startup", "momentum"],
  },
  {
    text: "First say to yourself what you would be; then do what you have to do.",
    author: "Epictetus",
    mood: ["startup", "focus"],
  },
  {
    text: "Waste no more time arguing what a good person should be. Be one.",
    author: "Marcus Aurelius",
    mood: ["focus", "skip"],
  },
  {
    text: "Discipline is choosing between what you want now and what you want most.",
    author: "Abraham Lincoln, commonly attributed",
    mood: ["skip", "focus"],
  },
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain, commonly attributed",
    mood: ["startup", "focus"],
  },
  {
    text: "A journey of a thousand miles begins with a single step.",
    author: "Lao Tzu",
    mood: ["startup", "momentum"],
  },
  {
    text: "It does not matter how slowly you go, so long as you do not stop.",
    author: "Confucius",
    mood: ["momentum", "review"],
  },
  {
    text: "No man is free who is not master of himself.",
    author: "Epictetus",
    mood: ["skip", "focus"],
  },
  {
    text: "The impediment to action advances action.",
    author: "Marcus Aurelius",
    mood: ["skip", "review"],
  },
];

const getStableIndex = (seed: string, length: number) => {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 1000003;
  }

  return Math.abs(hash) % length;
};

export const getDisciplineQuote = (
  mood: DisciplineQuoteMood,
  seed = new Date().toDateString()
) => {
  const candidates = disciplineQuotes.filter((quote) =>
    quote.mood.includes(mood)
  );
  const source = candidates.length > 0 ? candidates : disciplineQuotes;

  return source[getStableIndex(`${mood}-${seed}`, source.length)];
};

export const getStartupQuote = () =>
  getDisciplineQuote("startup", new Date().toDateString());

export const getSkipQuote = (taskTitle?: string | null) =>
  getDisciplineQuote(
    "skip",
    `${new Date().toDateString()}-${taskTitle?.trim().toLowerCase() ?? "task"}`
  );
