// One fact sheet for every listing and her website, so her name, address, phone,
// fees and insurance read the same everywhere (Google matches listings on these;
// docs/research.md > Media presence, section 6). Built only from what she already
// told Aeon, plus a few short answers in her own words that only she can give
// (Psychology Today's terms allow AI text only once it is personalized and
// fact-checked). Her answers live in clinician_profile.onboarding_answers -> 'media'.
import { z } from "zod";
import { db } from "../db";
import { alertCrisis, checkCrisis, CRISIS_REPLY } from "../safety";
import { guard, REFUSAL } from "../aeon/guard";
import { loadCredentialingProfile } from "../credentialing/store";
import { loadPracticeSettings } from "../gfe/store";
import { listPayerApplications, WAITING } from "../payers/store";
import { loadPolicies } from "../client-forms/store";
import { parsePt, type PtAnswers } from "./pt-answers";

export type MediaAnswers = {
  /** Why she does this work, in her words. */
  why: string;
  /** What a first session with her is like. */
  firstSession: string;
  /** What people most often come to her for (issues, not clients). */
  focus: string;
  /** How she works, approaches she uses. */
  approach: string;
  languages: string;
  yearsInPractice: number | null;
  /** 0 = no free consult. */
  freeConsultMinutes: 0 | 15 | 20 | 30;
  /** She answered the free consult question, so 0 really means "no free consult". */
  consultAsked: boolean;
};

export const EMPTY_ANSWERS: MediaAnswers = { why: "", firstSession: "", focus: "", approach: "", languages: "", yearsInPractice: null, freeConsultMinutes: 0, consultAsked: false };

export type MediaFacts = {
  name: string;
  credential: string;
  practiceName: string;
  neighborhood: string | null;
  city: string;
  state: string;
  address: { street: string; city: string; state: string; zip: string } | null;
  phone: string;
  email: string;
  telehealth: boolean;
  fees: { label: string; cents: number }[];
  /** Insurers she is in network with or applying to (any of these may be named). */
  insurers: string[];
  /** Insurers that approved her: only these are "in network". */
  inNetwork: string[];
  /** Ages and groups she sees, from onboarding ("Adults; Couples"). */
  whoIHelp: string;
  website: string | null;
  /** From the marketing interview: has a site, would like one, or not for her. */
  websiteStatus: "has" | "wants" | "no" | null;
  /** School, degree and year lines she gave (her Psychology Today answer, else a real credentialing record; never sample data). */
  education: string[];
  /** Sliding scale or reduced fees: her Psychology Today answer, else her saved client-form policies; null when she hasn't said. */
  slidingScale: boolean | null;
  isSample: boolean;
  answers: MediaAnswers;
  /** Her Psychology Today interview answers (pick-lists and short facts). */
  pt: PtAnswers;
};

/** The questions Aeon asks before drafting (the words a profile can't do without). */
export const QUESTIONS: { id: keyof MediaAnswers; ask: string; help: string; kind: "text" | "number" | "consult"; max?: number }[] = [
  { id: "focus", ask: "What do people most often come to you for?", help: "For example: anxiety, life changes, couples who argue a lot. Please don't describe any client.", kind: "text", max: 200 },
  { id: "approach", ask: "How do you like to work?", help: "Name any approaches you use, in your own words.", kind: "text", max: 200 },
  { id: "firstSession", ask: "What is a first session with you like?", help: "A sentence or two is plenty.", kind: "text", max: 200 },
  { id: "why", ask: "Why do you do this work?", help: "One honest sentence reads best.", kind: "text", max: 200 },
  { id: "languages", ask: "Do you see clients in any language besides English?", help: "Leave it empty if not.", kind: "text", max: 80 },
  { id: "yearsInPractice", ask: "How many years have you been in practice?", help: "Only whole years. Leave it empty to leave it out.", kind: "number" },
  { id: "freeConsultMinutes", ask: "Do you offer a free consult call?", help: "Profiles say this the same way everywhere.", kind: "consult" },
];

const text = (max: number) => z.string().trim().max(max, `Please keep this under ${max} characters.`);
export const answersSchema = z
  .object({
    why: text(200),
    firstSession: text(200),
    focus: text(200),
    approach: text(200),
    languages: text(80),
    yearsInPractice: z.number().int().min(0).max(70).nullable(),
    freeConsultMinutes: z.union([z.literal(0), z.literal(15), z.literal(20), z.literal(30)]),
    consultAsked: z.boolean(),
  })
  .strict();

export function parseAnswers(raw: unknown): MediaAnswers {
  const r = answersSchema.partial().safeParse(raw ?? {});
  return { ...EMPTY_ANSWERS, ...(r.success ? r.data : {}) } as MediaAnswers;
}

/**
 * The given answers for questions she hasn't answered yet; everything she already
 * answered is kept as she said it. The consult counts as answered once she was asked,
 * even when her answer was "no" (0).
 */
export function onlyUnanswered(saved: MediaAnswers, given: Partial<Omit<MediaAnswers, "consultAsked">>): Partial<MediaAnswers> {
  const out: Partial<MediaAnswers> = {};
  for (const [k, v] of Object.entries(given) as [keyof MediaAnswers, MediaAnswers[keyof MediaAnswers] | undefined][]) {
    if (v === undefined) continue;
    const empty = k === "freeConsultMinutes" ? !saved.consultAsked && !saved.freeConsultMinutes : saved[k] === "" || saved[k] === null;
    if (empty) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Which questions she hasn't answered yet (languages and years may stay empty). */
export function missingAnswers(a: MediaAnswers): (keyof MediaAnswers)[] {
  return (["focus", "approach", "firstSession", "why"] as const).filter((k) => !a[k]);
}

export class AnswerRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnswerRefused";
  }
}

/**
 * Her typed words go through the crisis check and the client-detail guard before they
 * are saved. A crisis hit answers with the fixed reply and alerts her phone, like the chat.
 */
export async function checkAnswerText(value: string, by = "clinician"): Promise<void> {
  if (!value) return;
  const crisis = checkCrisis(value);
  if (crisis.crisis) {
    await alertCrisis({ source: "media", category: crisis.category, by });
    throw new AnswerRefused(CRISIS_REPLY);
  }
  const g = await guard(value, "message");
  if (!g.ok) throw new AnswerRefused(REFUSAL[g.kind]);
}

export async function saveMediaAnswers(input: unknown): Promise<MediaAnswers> {
  const current = await loadMediaAnswers();
  const given = (input ?? {}) as Record<string, unknown>;
  const merged = answersSchema.parse({ ...current, ...given, ...("freeConsultMinutes" in given ? { consultAsked: true } : {}) });
  for (const k of ["why", "firstSession", "focus", "approach", "languages"] as const) await checkAnswerText(merged[k]);
  await db()`
    update practice_os.clinician_profile
       set onboarding_answers = jsonb_set(coalesce(onboarding_answers, '{}'::jsonb), '{media}',
           coalesce(onboarding_answers -> 'media', '{}'::jsonb) || ${db().json({ answers: merged } as never)}, true)`;
  return merged;
}

export async function loadMediaAnswers(): Promise<MediaAnswers> {
  const [row] = await db()<{ a: unknown }[]>`select onboarding_answers #> '{media,answers}' as a from practice_os.clinician_profile limit 1`;
  return parseAnswers(row?.a);
}

export async function loadMediaFacts(): Promise<MediaFacts> {
  const [p] = await db()<
    { full_name: string; credential: string; practice_name: string; neighborhood: string | null; city: string; state: string; is_sample: boolean; answers: Record<string, unknown> | null }[]
  >`select full_name, credential, practice_name, neighborhood, city, state, is_sample, onboarding_answers as answers from practice_os.clinician_profile limit 1`;
  if (!p) throw new Error("Finish setting up your practice first, so Aeon knows what to write.");
  const [cred, settings, payers, policies] = await Promise.all([loadCredentialingProfile(), loadPracticeSettings(), listPayerApplications(), loadPolicies()]);
  const a = p.answers ?? {};
  const loc = cred?.practiceLocation;
  const media = (a.media ?? {}) as Record<string, unknown>;
  const marketing = (a.marketing ?? {}) as Record<string, unknown>;
  const pt = parsePt(media.pt);
  return {
    name: p.full_name,
    credential: p.credential,
    practiceName: p.practice_name,
    neighborhood: p.neighborhood,
    city: p.city,
    state: p.state,
    address: loc?.address.street ? loc.address : null,
    phone: loc?.phone || cred?.identity.phone || "",
    email: cred?.identity.email ?? "",
    telehealth: Boolean(loc?.telehealth),
    fees: settings.fees.map((f) => ({ label: f.label, cents: f.cents })),
    // Approved, or applied and waiting (applied, pending, follow_up). A plan she hasn't applied to
    // yet (not_started, preparing) never reaches public copy, not even as "applying".
    insurers: payers.filter((x) => x.status === "approved" || WAITING.includes(x.status)).map((x) => x.payer),
    inNetwork: payers.filter((x) => x.status === "approved").map((x) => x.payer),
    whoIHelp: typeof a.who_i_help === "string" ? a.who_i_help : "",
    website: typeof marketing.website_url === "string" ? marketing.website_url : null,
    websiteStatus: marketing.website === "has" || marketing.website === "wants" || marketing.website === "no" ? marketing.website : null,
    // What she told the Psychology Today interview wins; a sample credentialing record never feeds a box or the school check.
    education: pt.education
      ? [pt.education]
      : cred?.isSample
        ? []
        : (cred?.education ?? []).filter((e) => e.school && !/\[sample\]/i.test(e.school)).map((e) => [e.degree, e.school, e.graduated].filter(Boolean).join(", ")),
    slidingScale: pt.slidingScale ?? (policies.saved && typeof policies.policies.offers_sliding_scale === "boolean" ? policies.policies.offers_sliding_scale : null),
    isSample: p.is_sample,
    answers: parseAnswers(media.answers),
    pt,
  };
}

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** The plain session fee to quote: her first regular session fee (an intake or first-session fee is skipped). */
export function mainFee(f: MediaFacts): string | null {
  const fee = f.fees.find((x) => !/\b(intake|first session|initial|evaluation|assessment)\b/i.test(x.label)) ?? f.fees[0];
  return fee ? money(fee.cents) : null;
}

export function place(f: MediaFacts): string {
  return [f.neighborhood, f.city].filter(Boolean).join(", ");
}
