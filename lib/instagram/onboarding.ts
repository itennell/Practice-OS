// Instagram's setup questions for onboarding chapter 6 (HelperBlock in
// lib/onboarding/helper-questions.ts). A short branching interview that never
// assumes she has or wants Instagram: "Not for me" skips every other screen here,
// turns the helper off and leaves a memory so Aeon doesn't bring it up again.
// Answers live in clinician_profile.onboarding_answers -> 'instagram', and post
// drafts (lib/instagram/write.ts) use her goals, topics, style and limits.
import { db } from "../db";
import { rememberLine } from "../onboarding/remember-line";
import type { HelperQuestion, PracticeBasics } from "../onboarding/helper-questions";
import { PILLARS, type PillarId } from "./pillars";
import { STYLES, type StyleId } from "./style-samples";

export type Account = "has" | "wants" | "no";
export type GoalId = "fill_spots" | "explain_fees" | "get_to_know";
export type NeverId = "face" | "office" | "family" | "home" | "none";

export type InstagramPrefs = {
  account: Account | null;
  connect: "now" | "later" | null;
  goals: GoalId[];
  topics: PillarId[];
  postsPerWeek: 1 | 3 | 5;
  neverShow: Exclude<NeverId, "none">[];
  style: StyleId | null;
  /** A post or bio she likes, for tone only. Checked by the crisis check and client-detail guard. */
  example: string;
};

export const DEFAULT_PREFS: InstagramPrefs = {
  account: null,
  connect: null,
  goals: [],
  topics: PILLARS.map((p) => p.id),
  postsPerWeek: 5,
  neverShow: [],
  style: null,
  example: "",
};

export const GOALS: { value: GoalId; label: string }[] = [
  { value: "fill_spots", label: "Fill my open spots" },
  { value: "explain_fees", label: "Explain my fees and insurance" },
  { value: "get_to_know", label: "Let people get to know me" },
];

export const NEVER_SHOW: { value: NeverId; label: string }[] = [
  { value: "face", label: "My face" },
  { value: "office", label: "My office" },
  { value: "family", label: "My family" },
  { value: "home", label: "My home" },
  { value: "none", label: "None of these, all are okay" },
];

/** How to make an Instagram business account, in plain words. Onboarding shows these; chat can too. */
export const ACCOUNT_STEPS = [
  "Get the Instagram app on your phone.",
  "Tap Sign up. Use your practice email, not your own.",
  "Pick a name with your practice in it.",
  "Go to Settings, then Account type and tools. Tap Switch to a professional account.",
  "Pick Business. Then pick the type that fits best.",
];

const CADENCE = { "1": 1, "3": 3, "5": 5 } as const;
type Mine = Record<string, unknown>;
/** Branches on her earlier answers in this block. */
const when = (f: (a: Mine) => boolean) => (_b: PracticeBasics, a?: Mine) => f(a ?? {});
const posting = when((a) => a.account === "has" || a.account === "wants");

const questions: HelperQuestion[] = [
  {
    id: "account",
    kind: "choices",
    multi: false,
    ask: "Do you have an Instagram for your practice?",
    says: "Lots of therapists skip Instagram. That's fine.",
    options: [
      { value: "has", label: "Yes, I have one" },
      { value: "wants", label: "No, but I'd like one" },
      { value: "no", label: "No, Instagram isn't for me" },
    ],
  },
  {
    id: "connect",
    kind: "connect",
    provider: "instagram",
    ask: "Do you want to connect it now?",
    says: "Then I can post for you, after you say yes to each post.",
    options: [
      { value: "now", label: "Connect now" },
      { value: "later", label: "Later" },
    ],
    later: { when: "later", ask: "Connect Instagram" },
    appliesWhen: when((a) => a.account === "has"),
  },
  {
    id: "guide",
    kind: "connect",
    provider: "instagram",
    ask: "How to make a business account",
    says: "It takes about 10 minutes. You can also ask me in chat any time.",
    steps: ACCOUNT_STEPS,
    options: [
      { value: "now", label: "I made it, connect it now" },
      { value: "later", label: "I'll do it later" },
    ],
    later: { when: "later", ask: "Make an Instagram business account" },
    appliesWhen: when((a) => a.account === "wants"),
  },
  {
    id: "goals",
    kind: "choices",
    multi: true,
    ask: "What should your posts help with?",
    help: "Pick all that fit.",
    says: "I'll plan posts around this.",
    options: GOALS,
    appliesWhen: posting,
  },
  {
    id: "topics",
    kind: "choices",
    multi: true,
    ask: "What should your posts be about?",
    says: "Pick as many as you like.",
    options: PILLARS.map((p) => ({ value: p.id, label: p.label })),
    note: {
      will: "Posts will cover: how to book, your fees, the first session, you, and your office.",
      wont: "Posts won't cover: advice about mental health, client stories, or reviews from clients.",
    },
    appliesWhen: posting,
  },
  {
    id: "posts_per_week",
    kind: "choices",
    multi: false,
    ask: "How often do you want to post?",
    says: "You say yes to every post before it goes up.",
    options: [
      { value: "1", label: "Once a week" },
      { value: "3", label: "3 times a week" },
      { value: "5", label: "5 times a week" },
    ],
    appliesWhen: posting,
  },
  {
    id: "never_show",
    kind: "choices",
    multi: true,
    exclusive: "none",
    ask: "What should posts never show?",
    help: "Pick all that fit.",
    says: "I'll leave these out of every post and picture.",
    options: NEVER_SHOW,
    appliesWhen: posting,
  },
  {
    id: "style",
    kind: "style",
    ask: "Which one sounds most like you?",
    says: "Here are three ways to say the same thing.",
    appliesWhen: posting,
  },
];

export const instagramQuestions = {
  helper: "instagram" as const,
  after: "find_clients",
  questions,
  async load(): Promise<Record<string, unknown>> {
    return toAnswers(await loadInstagramPrefs());
  },
  /** Onboarding saves one question at a time, so the other answers are kept. */
  async save(answers: Record<string, unknown>): Promise<void> {
    const before = await loadInstagramPrefs();
    const next = parsePrefs({ ...toAnswers(before), ...answers });
    await saveInstagramPrefs(next);
    await afterSave(before, next, Object.keys(answers));
  },
};

function toAnswers(p: InstagramPrefs): Record<string, unknown> {
  const out: Record<string, unknown> = {
    goals: p.goals,
    topics: p.topics,
    posts_per_week: String(p.postsPerWeek),
    never_show: p.neverShow,
    style: { pick: p.style ?? "", example: p.example },
  };
  if (p.account) out.account = p.account;
  if (p.connect) out.connect = out.guide = p.connect;
  return out;
}

const oneOf = <T extends string>(v: unknown, list: readonly T[], msg: string): T | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !list.includes(v as T)) throw new Error(msg);
  return v as T;
};
const someOf = <T extends string>(v: unknown, list: readonly T[], msg: string): T[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !list.includes(x as T))) throw new Error(msg);
  return [...new Set(v as T[])];
};

/** Checks onboarding's answers; throws plain words on anything else. */
export function parsePrefs(answers: Record<string, unknown>): InstagramPrefs {
  const account = oneOf(answers.account, ["has", "wants", "no"] as const, "Pick one of the three.");
  const connect = oneOf(answers.connect ?? answers.guide, ["now", "later"] as const, "Pick one.");
  const goals = someOf(answers.goals, GOALS.map((g) => g.value), "Pick from the list.");
  const topics = someOf(answers.topics ?? DEFAULT_PREFS.topics, PILLARS.map((p) => p.id), "Pick topics from the list.");
  if (topics.length === 0) throw new Error("Pick at least one topic, or choose Set up later.");
  const count = CADENCE[String(answers.posts_per_week ?? "5") as keyof typeof CADENCE];
  if (!count) throw new Error("Pick once, 3 or 5 times a week.");
  const never = someOf(answers.never_show, NEVER_SHOW.map((n) => n.value), "Pick from the list.");
  const s = (answers.style ?? {}) as { pick?: unknown; example?: unknown };
  if (typeof s !== "object") throw new Error("Pick one, or paste a post you like.");
  const style = oneOf(s.pick, STYLES.map((x) => x.id), "Pick one of the three.");
  const example = typeof s.example === "string" ? s.example.trim() : "";
  if (example.length > 600) throw new Error("Please keep it under 600 letters.");
  return {
    account,
    connect,
    goals,
    topics,
    postsPerWeek: count,
    neverShow: never.filter((n): n is Exclude<NeverId, "none"> => n !== "none"),
    style,
    example,
  };
}

export async function loadInstagramPrefs(): Promise<InstagramPrefs> {
  const [row] = await db()<{ prefs: unknown }[]>`select onboarding_answers -> 'instagram' as prefs from practice_os.clinician_profile limit 1`;
  if (!row?.prefs || typeof row.prefs !== "object") return DEFAULT_PREFS;
  const p = row.prefs as Record<string, unknown>;
  try {
    return parsePrefs({ ...p, style: { pick: p.style, example: p.example } });
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveInstagramPrefs(p: InstagramPrefs): Promise<void> {
  const value = {
    account: p.account,
    connect: p.connect,
    goals: p.goals,
    topics: p.topics,
    posts_per_week: String(p.postsPerWeek),
    never_show: p.neverShow,
    style: p.style,
    example: p.example,
  };
  await db()`
    update practice_os.clinician_profile
       set onboarding_answers = jsonb_set(coalesce(onboarding_answers, '{}'::jsonb), '{instagram}', ${db().json(value)}, true)`;
}

/** Whether she has said Instagram isn't for her: nothing Instagram is offered or suggested then. */
export async function instagramDeclined(): Promise<boolean> {
  return (await loadInstagramPrefs()).account === "no";
}

const ACCOUNT_WORDS: Record<Account, string> = {
  has: "Has an Instagram account for the practice.",
  wants: "Wants an Instagram business account for the practice; doesn't have one yet.",
  no: "Doesn't want Instagram for the practice. Never suggest Instagram or posts.",
};
const label = (list: { value: string; label: string }[], ids: string[]) => ids.map((id) => list.find((x) => x.value === id)?.label ?? id).join(", ");

/** Turns the helper on or off with her answer, and keeps Aeon's memory in step. */
async function afterSave(before: InstagramPrefs, p: InstagramPrefs, changed: string[]): Promise<void> {
  if (changed.includes("account") && p.account) {
    await db()`
      update practice_os.settings
         set helpers_enabled = coalesce(helpers_enabled, '{}'::jsonb) || ${db().json({ instagram: p.account !== "no" })}`;
    if (p.account !== before.account) await rememberLine("Instagram:", `Instagram: ${ACCOUNT_WORDS[p.account]}`, "preference");
  }
  if (changed.includes("goals") && p.goals.length) await rememberLine("Instagram post goals:", `Instagram post goals: ${label(GOALS, p.goals)}.`, "preference");
  if (changed.includes("never_show"))
    await rememberLine(
      "Instagram posts never show:",
      p.neverShow.length ? `Instagram posts never show: ${label(NEVER_SHOW, p.neverShow).toLowerCase()}.` : "Instagram posts never show: nothing ruled out.",
      "preference",
    );
  if (changed.includes("style") && p.style)
    await rememberLine("Instagram post style:", `Instagram post style: ${STYLES.find((s) => s.id === p.style)!.label.toLowerCase()}.`, "preference");
}

/** Which topics this week: her picks in the usual order, one post each, up to her posts a week. */
export function weekTopics(p: InstagramPrefs): PillarId[] {
  const order = PILLARS.map((x) => x.id).filter((id) => p.topics.includes(id));
  return Array.from({ length: Math.min(p.postsPerWeek, order.length) }, (_, i) => order[i]);
}
