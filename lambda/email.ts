export type StageKey =
  | "calm"
  | "cheeky"
  | "unhinged"
  | "chaotic"
  | "peak"
  | "theday";

export interface Stage {
  key: StageKey;
  tone: string;
  emoji: string;
  accent: string;
  gradient: string;
  label: string;
  subjectPrefix: string;
  allCaps: boolean;
}

const STAGES: Record<StageKey, Stage> = {
  calm: {
    key: "calm",
    tone: "dry, understated, barely-amused corporate tone. A single restrained joke at most.",
    emoji: "🗓️",
    accent: "#2563eb",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    label: "days to go",
    subjectPrefix: "🗓️",
    allCaps: false,
  },
  cheeky: {
    key: "cheeky",
    tone: "noticeably cheekier, gentle countdown humor, a bit of a smirk.",
    emoji: "😏",
    accent: "#0d9488",
    gradient: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
    label: "days to go",
    subjectPrefix: "😏",
    allCaps: false,
  },
  unhinged: {
    key: "unhinged",
    tone: "unhinged office-countdown energy, playful exaggeration, mock-desperate.",
    emoji: "🤪",
    accent: "#d97706",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    label: "days to go",
    subjectPrefix: "🤪",
    allCaps: false,
  },
  chaotic: {
    key: "chaotic",
    tone: "chaotic, escalating absurdity, all-caps and exclamation marks welcome.",
    emoji: "🔥",
    accent: "#ea580c",
    gradient: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
    label: "DAYS TO GO",
    subjectPrefix: "🔥",
    allCaps: true,
  },
  peak: {
    key: "peak",
    tone: "peak celebratory chaos, over-the-top excitement, confetti-emoji energy.",
    emoji: "🎉",
    accent: "#db2777",
    gradient: "linear-gradient(135deg, #ec4899 0%, #db2777 100%)",
    label: "DAYS TO GO",
    subjectPrefix: "🎉",
    allCaps: true,
  },
  theday: {
    key: "theday",
    tone: "today is the day — triumphant, warm, a little emotional, congratulatory.",
    emoji: "🥳",
    accent: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
    label: "",
    subjectPrefix: "🥳",
    allCaps: true,
  },
};

export function stageForDays(n: number): Stage {
  if (n > 365) return STAGES.calm;
  if (n > 100) return STAGES.cheeky;
  if (n > 30) return STAGES.unhinged;
  if (n > 7) return STAGES.chaotic;
  if (n > 0) return STAGES.peak;
  return STAGES.theday;
}

export function progressPct(
  startISO: string,
  retirementISO: string,
  today: Date
): number {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${retirementISO}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const pct = ((now - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
