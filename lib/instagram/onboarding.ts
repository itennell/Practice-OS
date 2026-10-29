// Instagram's setup questions for onboarding chapter 6 (HelperBlock in
// lib/onboarding/helper-questions.ts, onboarding session). Answers live in
// clinician_profile.onboarding_answers -> 'instagram', and Plan this week uses them.
import { db } from "../db";
import { PILLARS, type PillarId } from "./pillars";

export type InstagramPrefs = { topics: PillarId[]; postsPerWeek: 1 | 3 | 5 };
export const DEFAULT_PREFS: InstagramPrefs = { topics: PILLARS.map((p) => p.id), postsPerWeek: 5 };

const CADENCE = { "1": 1, "3": 3, "5": 5 } as const;

export const instagramQuestions = {
  helper: "instagram" as const,
  questions: [
    {
      id: "topics",
      kind: "choices" as const,
      multi: true,
      ask: "What should your Instagram posts be about?",
      help: "Pick any. Posts only cover how your practice works, never advice or client stories.",
      options: PILLARS.map((p) => ({ value: p.id, label: p.label })),
    },
    {
      id: "posts_per_week",
      kind: "choices" as const,
      multi: false,
      ask: "How many posts should Aeon plan each week?",
      help: "You approve every post before it goes up.",
      options: [
        { value: "1", label: "1 a week" },
        { value: "3", label: "3 a week" },
        { value: "5", label: "5 a week" },
      ],
    },
  ],
  async load(): Promise<Record<string, unknown>> {
    const p = await loadInstagramPrefs();
    return { topics: p.topics, posts_per_week: String(p.postsPerWeek) };
  },
  /** Onboarding saves one question at a time, so the other answer is kept. */
  async save(answers: Record<string, unknown>): Promise<void> {
    const now = await loadInstagramPrefs();
    await saveInstagramPrefs(parsePrefs({ topics: now.topics, posts_per_week: String(now.postsPerWeek), ...answers }));
  },
};

/** Checks onboarding's answers; throws plain words on anything else. */
export function parsePrefs(answers: Record<string, unknown>): InstagramPrefs {
  const ids = new Set<string>(PILLARS.map((p) => p.id));
  const raw = answers.topics ?? DEFAULT_PREFS.topics;
  if (!Array.isArray(raw) || raw.some((t) => typeof t !== "string" || !ids.has(t))) throw new Error("Pick topics from the list.");
  const topics = [...new Set(raw as PillarId[])];
  if (topics.length === 0) throw new Error("Pick at least one topic, or choose Set up later.");
  const count = CADENCE[String(answers.posts_per_week ?? "5") as keyof typeof CADENCE];
  if (!count) throw new Error("Pick 1, 3 or 5 posts a week.");
  return { topics, postsPerWeek: count };
}

export async function loadInstagramPrefs(): Promise<InstagramPrefs> {
  const [row] = await db()<{ prefs: unknown }[]>`select onboarding_answers -> 'instagram' as prefs from practice_os.clinician_profile limit 1`;
  if (!row?.prefs || typeof row.prefs !== "object") return DEFAULT_PREFS;
  const p = row.prefs as { topics?: unknown; posts_per_week?: unknown };
  try {
    return parsePrefs({ topics: p.topics, posts_per_week: p.posts_per_week });
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveInstagramPrefs(p: InstagramPrefs): Promise<void> {
  const value = { topics: p.topics, posts_per_week: String(p.postsPerWeek) };
  await db()`
    update practice_os.clinician_profile
       set onboarding_answers = jsonb_set(coalesce(onboarding_answers, '{}'::jsonb), '{instagram}', ${db().json(value)}, true)`;
}

/** Which topics this week: her picks in the usual order, one post each, up to her posts a week. */
export function weekTopics(p: InstagramPrefs): PillarId[] {
  const order = PILLARS.map((x) => x.id).filter((id) => p.topics.includes(id));
  return Array.from({ length: Math.min(p.postsPerWeek, order.length) }, (_, i) => order[i]);
}
