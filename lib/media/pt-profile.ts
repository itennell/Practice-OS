// The Psychology Today interview and the profile it builds. One list of steps,
// section by section in the order a PT profile reads (header, statement, photos,
// free consult, At a Glance, Finances, Qualifications, Specialties, Endorsements,
// Client Focus, Treatment Approach, Location), drives the Media page, the chat tool
// (pt_profile_interview) and the copy-and-paste export, so they never drift apart.
// Chip steps use PT's own pick-list wording (PT_LISTS) so her answers match its
// search filters. Every typed answer goes through the crisis check, the client-detail
// guard and the profile lint before it is saved. Nothing is sent anywhere.
import { db } from "../db";
import { audit } from "../audit";
import { STATES } from "../compliance/states";
import { AnswerRefused, checkAnswerText, mainFee, money, place, saveMediaAnswers, type MediaAnswers, type MediaFacts } from "./facts";
import { lintText } from "./lint";
import { assemble, cardPreview, finish, type DraftField, type ProfileDraft } from "./profile";
import { EMPTY_PT, ptSchema, type PtAnswers } from "./pt-answers";
import { HOOK_CHARS, PT_LISTS, type PtListId, type PtTextId } from "./schema";
import { MAKE_IT_YOURS, SECTIONS, SECTION_TITLE, WELCOME, type SectionId } from "./pt-sections";

export { MAKE_IT_YOURS, SECTIONS, SECTION_TITLE, WELCOME, type SectionId } from "./pt-sections";

type MediaKey = keyof MediaAnswers;
type PtKey = Exclude<keyof PtAnswers, "seen" | "skipped">;
export type Option = { value: string; label: string };

export type Step = {
  id: string;
  section: SectionId;
  ask: string;
  help: string;
} & (
  | { kind: "confirm" | "info" }
  | { kind: "text"; key: MediaKey | PtKey; max: number; ownWords: boolean }
  | { kind: "number"; key: "yearsInPractice" }
  | { kind: "choice"; key: "freeConsultMinutes" | "availability" | "slidingScale"; options: Option[] }
  | { kind: "multi"; key: PtKey; list: PtListId; min: number; max: number; optional: boolean }
);

const OWN = "In your own words. Please don't describe any client.";

export const STEPS: Step[] = [
  { id: "header", section: "header", kind: "confirm", ask: "Is this how your name and title should read?", help: "Psychology Today may show a verified badge after it checks your license (Aeon hasn't confirmed this). Change these in Settings if anything is wrong." },
  { id: "focus", section: "statement", kind: "text", key: "focus", max: 200, ownWords: true, ask: "What do people most often come to you for?", help: `For example: anxiety, life changes, couples who argue a lot. ${OWN}` },
  { id: "firstSession", section: "statement", kind: "text", key: "firstSession", max: 200, ownWords: true, ask: "What is a first session with you like?", help: "A sentence or two is plenty." },
  { id: "approach", section: "statement", kind: "text", key: "approach", max: 200, ownWords: true, ask: "How do you like to work?", help: "Name any approaches you use, in your own words." },
  { id: "why", section: "statement", kind: "text", key: "why", max: 200, ownWords: true, ask: "Why do you do this work?", help: "One honest sentence reads best." },
  { id: "photo", section: "photos", kind: "info", ask: "Add your photos in Psychology Today", help: "A clear, friendly photo of you helps most. You upload it in the editor yourself; Aeon never makes one for your real profile." },
  {
    id: "freeConsultMinutes",
    section: "consult",
    kind: "choice",
    key: "freeConsultMinutes",
    ask: "Do you offer a free consult call?",
    help: "Your profile says this the same way everywhere.",
    options: [
      { value: "15", label: "Yes, 15 minutes" },
      { value: "20", label: "Yes, 20 minutes" },
      { value: "30", label: "Yes, 30 minutes" },
      { value: "0", label: "No free consult" },
    ],
  },
  {
    id: "availability",
    section: "glance",
    kind: "choice",
    key: "availability",
    ask: "Are you taking new clients right now?",
    help: "This shows at the top of your At a Glance card.",
    options: [
      { value: "accepting", label: "Yes, taking new clients" },
      { value: "waitlist", label: "Waitlist for now" },
      { value: "full", label: "Not right now" },
    ],
  },
  { id: "sessionFormat", section: "glance", kind: "multi", key: "sessionFormat", list: "sessionFormat", min: 1, max: 2, optional: false, ask: "Do you see clients in person, online, or both?", help: "Clients filter on this." },
  { id: "fees", section: "finances", kind: "confirm", ask: "Are these your fees?", help: "Aeon uses only the fees you saved. Change them in Settings if they're wrong." },
  { id: "paymentMethods", section: "finances", kind: "multi", key: "paymentMethods", list: "paymentMethods", min: 0, max: 15, optional: true, ask: "How can clients pay you?", help: "Tap all that apply." },
  {
    id: "slidingScale",
    section: "finances",
    kind: "choice",
    key: "slidingScale",
    ask: "Do you offer a sliding scale?",
    help: "Psychology Today shows this beside your fees.",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  { id: "insurance", section: "finances", kind: "confirm", ask: "Is this your insurance?", help: "Only plans that approved you show as in network. Others stay off until they do." },
  { id: "yearsInPractice", section: "qualifications", kind: "number", key: "yearsInPractice", ask: "How many years have you been in practice?", help: "Whole years. Leave it empty to leave it out." },
  { id: "education", section: "qualifications", kind: "text", key: "education", max: 160, ownWords: false, ask: "Where did you get your degree, and when?", help: "For example: MA, Clinical Mental Health Counseling, Example University, 2019." },
  { id: "extraCredentials", section: "qualifications", kind: "text", key: "extraCredentials", max: 160, ownWords: false, ask: "Any other certificates or trainings you'd like listed?", help: "With the year if you have it. Leave it empty if not." },
  { id: "topSpecialties", section: "specialties", kind: "multi", key: "topSpecialties", list: "specialties", min: 3, max: 3, optional: false, ask: "What are your top 3 specialties?", help: "Psychology Today shows exactly three, and clients search by them." },
  { id: "expertise", section: "specialties", kind: "multi", key: "expertise", list: "specialties", min: 0, max: 25, optional: true, ask: "What else do you have expertise in?", help: "Pick what you really work with; ten or so reads well." },
  { id: "endorsements", section: "endorsements", kind: "info", ask: "Endorsements come from colleagues", help: "Other Psychology Today members endorse you from your profile. Ask a colleague who knows your work; Aeon never writes one." },
  { id: "ages", section: "clientFocus", kind: "multi", key: "ages", list: "ages", min: 1, max: 6, optional: false, ask: "Which ages do you see?", help: "Clients filter by age." },
  { id: "participants", section: "clientFocus", kind: "multi", key: "participants", list: "participants", min: 1, max: 4, optional: false, ask: "Who do you see together in a session?", help: "Leaving Couples off removes you from couples searches." },
  { id: "communities", section: "clientFocus", kind: "multi", key: "communities", list: "communities", min: 0, max: 10, optional: true, ask: "Any communities you're allied with?", help: "Only what's true for you. Skip it if none." },
  { id: "faith", section: "clientFocus", kind: "multi", key: "faith", list: "faith", min: 0, max: 5, optional: true, ask: "Do you work with any faith in particular?", help: "Skip it if not." },
  { id: "languages", section: "clientFocus", kind: "text", key: "languages", max: 80, ownWords: false, ask: "Do you see clients in any language besides English?", help: "Leave it empty if not." },
  { id: "therapyTypes", section: "treatment", kind: "multi", key: "therapyTypes", list: "therapyTypes", min: 1, max: 15, optional: false, ask: "Which types of therapy do you use?", help: "Clients filter on these, so pick the ones you're trained in." },
  { id: "location", section: "location", kind: "confirm", ask: "Is this your office?", help: "Change it in Settings if it's wrong." },
  { id: "nearby", section: "location", kind: "text", key: "nearby", max: 200, ownWords: false, ask: "Which nearby neighborhoods, cities or ZIP codes do your clients come from?", help: "For example: Lakeview, Old Town, 60657. Leave it empty to use your own area." },
];

export const STEP = new Map(STEPS.map((s) => [s.id, s]));

/** Short names for the questions she skipped. */
const SHORT: Record<string, string> = {
  focus: "What people come to you for",
  firstSession: "First session",
  approach: "How you work",
  why: "Why you do this work",
  freeConsultMinutes: "Free consult",
  availability: "Taking new clients",
  sessionFormat: "In person or online",
  paymentMethods: "Payment methods",
  slidingScale: "Sliding scale",
  yearsInPractice: "Years in practice",
  education: "Education",
  extraCredentials: "Other credentials",
  topSpecialties: "Top 3 specialties",
  expertise: "Expertise",
  ages: "Ages",
  participants: "Participants",
  communities: "Communities",
  faith: "Faith",
  languages: "Languages",
  therapyTypes: "Types of therapy",
  nearby: "Nearby areas",
};

// ---- prefill --------------------------------------------------------------------------

const AGE_FROM_WHO: Record<string, string> = { children: "Children (6 to 10)", teens: "Teen", adults: "Adults", "older adults": "Elders (65+)" };
const PARTICIPANT_FROM_WHO: Record<string, string> = { children: "Individuals", teens: "Individuals", adults: "Individuals", "older adults": "Individuals", couples: "Couples", families: "Family", groups: "Group" };

function fromWho(f: MediaFacts, map: Record<string, string>): string[] {
  const out = f.whoIHelp.split(";").map((s) => map[s.trim().toLowerCase()]).filter(Boolean);
  return [...new Set(out)];
}

/** What a step shows before she answers: her answer if she gave one, else what Aeon already knows. */
export function valueOf(step: Step, f: MediaFacts): unknown {
  if (!("key" in step)) return null;
  const pt = f.pt;
  const seen = pt.seen.includes(step.id);
  switch (step.key) {
    case "sessionFormat":
      return seen || pt.sessionFormat.length ? pt.sessionFormat : f.telehealth ? ["In Person", "Online"] : ["In Person"];
    case "ages":
      return seen || pt.ages.length ? pt.ages : fromWho(f, AGE_FROM_WHO);
    case "participants":
      return seen || pt.participants.length ? pt.participants : fromWho(f, PARTICIPANT_FROM_WHO);
    case "education":
      return seen || pt.education ? pt.education : f.education.join("; ");
    case "freeConsultMinutes":
      return String(f.answers.freeConsultMinutes);
    case "slidingScale":
      return pt.slidingScale === null ? null : pt.slidingScale ? "yes" : "no";
    default:
      return step.key in f.answers ? f.answers[step.key as MediaKey] : pt[step.key as PtKey];
  }
}

/** The facts a confirm step shows. */
export function confirmLines(step: Step, f: MediaFacts): string[] {
  switch (step.id) {
    case "header":
      return [`${f.name}, ${f.credential}`, titleWords(f), f.practiceName, place(f)].filter(Boolean);
    case "fees":
      return f.fees.length ? f.fees.map((x) => `${x.label}: ${money(x.cents)}`) : ["No fees saved yet. Add them in Settings, or Aeon leaves fees off."];
    case "insurance":
      return [f.inNetwork.length ? `In network: ${f.inNetwork.join(", ")}` : "Out of network (Aeon says superbills are available)"];
    case "location":
      return [f.address ? `${f.address.street}, ${f.address.city}, ${f.address.state} ${f.address.zip}` : place(f), f.telehealth ? `Also online in ${stateName(f)}` : ""].filter(Boolean);
    default:
      return [];
  }
}

export function optionsFor(step: Step): Option[] {
  if (step.kind === "choice") return step.options;
  if (step.kind === "multi") return PT_LISTS[step.list].options.map((o) => ({ value: o, label: o }));
  return [];
}

// ---- the interview ---------------------------------------------------------------------

export type InterviewStep = {
  id: string;
  section: SectionId;
  sectionTitle: string;
  kind: Step["kind"];
  ask: string;
  help: string;
  options: Option[];
  min?: number;
  max?: number;
  value: unknown;
  lines: string[];
  number: number;
  /** The question before this one, for Back. */
  prev: string | null;
  /** True when she can't skip it. */
  required: boolean;
};

export type InterviewState = {
  welcome: string;
  total: number;
  answered: number;
  step: InterviewStep | null;
  /** Steps she put off, to come back to. */
  skipped: { id: string; label: string }[];
  done: boolean;
};

function present(step: Step, f: MediaFacts): InterviewStep {
  return {
    id: step.id,
    section: step.section,
    sectionTitle: SECTION_TITLE[step.section],
    kind: step.kind,
    ask: step.ask,
    help: step.help,
    options: optionsFor(step),
    ...(step.kind === "multi" ? { min: step.min, max: step.max } : step.kind === "text" ? { max: step.max } : {}),
    value: valueOf(step, f),
    lines: confirmLines(step, f),
    number: STEPS.indexOf(step) + 1,
    prev: previousStep(step.id),
    required: isRequired(step),
  };
}

/** The step to show: the one asked for (Back), else the first she hasn't answered or skipped. */
export function interviewState(f: MediaFacts, at?: string): InterviewState {
  const seen = new Set(f.pt.seen);
  const asked = at ? STEP.get(at) : undefined;
  const next = asked ?? STEPS.find((s) => !seen.has(s.id));
  return {
    welcome: WELCOME,
    total: STEPS.length,
    answered: STEPS.filter((s) => seen.has(s.id)).length,
    step: next ? present(next, f) : null,
    skipped: f.pt.skipped.filter((id) => STEP.has(id)).map((id) => ({ id, label: SHORT[id] ?? SECTION_TITLE[STEP.get(id)!.section] })),
    done: !next,
  };
}

export function previousStep(id: string): string | null {
  const i = STEPS.findIndex((s) => s.id === id);
  return i > 0 ? STEPS[i - 1].id : null;
}

export type StepPatch = { media: Partial<MediaAnswers>; pt: Partial<PtAnswers> };

// Therapy methods named after people (Gottman Method, Internal Family Systems...) can
// read as a person's name to the client-detail guard. Only whole multi-word method
// phrases are masked for that check, never a single word, so "my client Christian
// Lopez" is still caught even though "Christian Counseling" is on the list.
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const METHOD_PHRASES = PT_LISTS.therapyTypes.options
  .map((o) => o.replace(/\s*\([^)]*\)\s*$/, "").trim())
  .filter((o) => /[\s-]/.test(o))
  .sort((a, b) => b.length - a.length);
const METHOD_RE = new RegExp(
  [
    ...METHOD_PHRASES.map((o) => `\\b${escapeRe(o)}\\b`),
    // Gottman trainings are named "Gottman Level 1", "Gottman Institute" and so on.
    "\\bGottman (?:Level \\d|Institute|Method|training|certified)\\b",
  ].join("|"),
  "gi",
);
export const maskMethods = (t: string) => t.replace(METHOD_RE, "method");

/** Text steps every profile needs: an empty answer is refused (Skip still works). */
const REQUIRED_TEXT = new Set<string>(["focus", "approach", "firstSession", "why"]);

/** A step she can't skip: Psychology Today needs it to list her in searches. */
export const isRequired = (step: Step) => step.kind === "multi" && !step.optional;

async function checkTyped(value: string, f: MediaFacts): Promise<void> {
  await checkAnswerText(maskMethods(value));
  const blocked = lintText(value, f).filter((x) => x.severity === "block");
  if (blocked.length) throw new AnswerRefused(blocked.map((x) => x.message).join(" "));
}

/**
 * For the chat tool: only the question she's on can be answered, or one she already
 * saw (reached with Back). Returns a plain reason when the step can't be answered now.
 */
export function stepNotAnswerable(f: MediaFacts, id: string): string | null {
  if (!STEP.has(id)) return "That question isn't part of the profile.";
  const current = interviewState(f).step?.id;
  if (id === current || f.pt.seen.includes(id)) return null;
  return current ? `That isn't the question we're on. The next one is: ${STEP.get(current)!.ask}` : "The interview is already finished.";
}

/**
 * Checks one answer and turns it into a patch. Chips may be PT's own labels or a short
 * one she typed; typed words get the same checks as everything else she writes.
 */
export async function validateStep(id: string, value: unknown, f: MediaFacts): Promise<StepPatch> {
  const step = STEP.get(id);
  if (!step) throw new AnswerRefused("That question isn't part of the profile.");
  const patch: StepPatch = { media: {}, pt: {} };
  switch (step.kind) {
    case "confirm":
    case "info":
      return patch;
    case "text": {
      if (typeof value !== "string") throw new AnswerRefused("Please type an answer, or tap Skip.");
      const t = value.replace(/\s+/g, " ").trim();
      if (t.length > step.max) throw new AnswerRefused(`Please keep this under ${step.max} characters.`);
      if (!t && REQUIRED_TEXT.has(step.key)) throw new AnswerRefused("Please type an answer, or tap Skip.");
      await checkTyped(t, f);
      if (step.key in f.answers) (patch.media as Record<string, unknown>)[step.key] = t;
      else (patch.pt as Record<string, unknown>)[step.key] = t;
      return patch;
    }
    case "number": {
      const n = value === null || value === "" ? null : Number(value);
      if (n !== null && (!Number.isInteger(n) || n < 0 || n > 70)) throw new AnswerRefused("Please give whole years, from 0 to 70.");
      patch.media.yearsInPractice = n;
      return patch;
    }
    case "choice": {
      const v = String(value ?? "");
      if (!step.options.some((o) => o.value === v)) throw new AnswerRefused("Please pick one of the choices.");
      if (step.key === "freeConsultMinutes") patch.media.freeConsultMinutes = Number(v) as MediaAnswers["freeConsultMinutes"];
      else if (step.key === "slidingScale") patch.pt.slidingScale = v === "yes";
      else patch.pt.availability = v as PtAnswers["availability"];
      return patch;
    }
    case "multi": {
      if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) throw new AnswerRefused("Please pick from the list.");
      const picked = [...new Set((value as string[]).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))];
      if (step.min === step.max && picked.length !== step.min) throw new AnswerRefused(`Please pick exactly ${step.min}.`);
      if (picked.length < step.min) throw new AnswerRefused(`Please pick at least ${step.min}.`);
      if (picked.length > step.max) throw new AnswerRefused(`Please pick at most ${step.max}.`);
      const known = new Set(PT_LISTS[step.list].options);
      for (const own of picked.filter((x) => !known.has(x))) {
        if (own.length > 60) throw new AnswerRefused("Please keep each one under 60 characters.");
        await checkTyped(own, f);
      }
      (patch.pt as Record<string, unknown>)[step.key] = picked;
      return patch;
    }
  }
}

async function savePt(next: PtAnswers): Promise<PtAnswers> {
  const clean = ptSchema.parse(next);
  await db()`
    update practice_os.clinician_profile
       set onboarding_answers = jsonb_set(coalesce(onboarding_answers, '{}'::jsonb), '{media}',
           coalesce(onboarding_answers -> 'media', '{}'::jsonb) || ${db().json({ pt: clean } as never)}, true)`;
  return clean;
}

const add = (xs: string[], x: string) => (xs.includes(x) ? xs : [...xs, x]);

/** Saves one answer (or a skip) and returns the facts as they now stand. */
export async function saveStep(f: MediaFacts, id: string, input: { value?: unknown; skip?: boolean }): Promise<MediaFacts> {
  if (!STEP.has(id)) throw new AnswerRefused("That question isn't part of the profile.");
  if (input.skip) {
    const step = STEP.get(id)!;
    if (isRequired(step) && step.kind === "multi")
      throw new AnswerRefused(
        `This one can't be skipped: Psychology Today needs it to list you in searches. Please pick ${step.min === step.max ? `exactly ${step.min}` : `at least ${step.min}`}.`,
      );
    const pt = await savePt({ ...f.pt, seen: add(f.pt.seen, id), skipped: add(f.pt.skipped, id) });
    return { ...f, pt };
  }
  const patch = await validateStep(id, input.value, f);
  const answers = Object.keys(patch.media).length ? await saveMediaAnswers(patch.media) : f.answers;
  const pt = await savePt({ ...f.pt, ...patch.pt, seen: add(f.pt.seen, id), skipped: f.pt.skipped.filter((x) => x !== id) });
  await audit({ actor: "clinician", action: "media_pt_answer", subjectType: "media_profile", details: { step: id } });
  return { ...f, answers, pt };
}

/** Clears her interview answers (not her own-words statement answers), to start over. */
export async function resetInterview(f: MediaFacts): Promise<MediaFacts> {
  return { ...f, pt: await savePt(EMPTY_PT) };
}

// ---- the profile as it will read ----------------------------------------------------------

const stateName = (f: MediaFacts) => STATES[f.state] ?? f.state;

const TITLE_WORDS: Record<string, string> = {
  LCPC: "Licensed Clinical Professional Counselor",
  LCSW: "Licensed Clinical Social Worker",
  LMFT: "Licensed Marriage and Family Therapist",
  Psychologist: "Licensed Clinical Psychologist",
};
export const titleWords = (f: MediaFacts) => TITLE_WORDS[f.credential] ?? f.credential;

const AVAILABILITY: Record<NonNullable<PtAnswers["availability"]>, string> = {
  accepting: "Taking new clients",
  waitlist: "Waitlist for new clients",
  full: "Not taking new clients right now",
};

export type Box = Pick<DraftField, "id" | "label" | "limit" | "text" | "from" | "pasteWhere"> & { findings: string[] };

export type ProfileView = {
  sample: boolean;
  /** "draft" = Aeon's saved draft; "live" = the plain draft built from her answers as she goes. */
  source: "draft" | "live";
  header: { name: string; credential: string; title: string; place: string; formats: string[]; phone: string; email: string; website: string | null };
  statement: { boxes: Box[]; snippet: string; snippetChars: number };
  consult: { minutes: number; intro: Box };
  glance: { availability: string | null; practiceName: string; locations: string[]; formatLine: string; topSpecialties: string[]; feeLine: string; insuranceLine: string; participants: string[] };
  finances: { fees: { label: string; amount: string }[]; slidingScale: boolean | null; paymentMethods: string[]; insurance: string[]; outOfNetwork: boolean; note: Box };
  qualifications: { licenseLine: string; years: number | null; education: string; extraCredentials: string; note: Box };
  specialties: { top: string[]; expertise: string[]; note: Box };
  clientFocus: { ages: string[]; participants: string[]; communities: string[]; faith: string[]; languages: string };
  treatment: { types: string[]; note: Box };
  location: { primary: string; online: string | null; nearby: string };
  /** Labels she typed that aren't one of Psychology Today's boxes (she types them under "Other"). */
  ownLabels: string[];
  sections: { id: SectionId; title: string; copy: string }[];
  /** Every section in order, for "Copy all, in order". */
  exportText: string;
};

const lines = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join("\n");

/** Builds the whole profile: Aeon's saved draft for the text boxes, or the plain one from her answers. */
export function buildProfileView(f: MediaFacts, draft: ProfileDraft | null): ProfileView {
  const d = draft ?? finish(f, assemble(f, null).fields, "template");
  const box = (id: PtTextId): Box => {
    const x = d.fields.find((b) => b.id === id)!;
    return { id: x.id, label: x.label, limit: x.limit, text: x.text, from: x.from, pasteWhere: x.pasteWhere, findings: x.findings.map((n) => n.message) };
  };
  const pt = f.pt;
  const formats = (valueOf(STEP.get("sessionFormat")!, f) as string[]) ?? [];
  const ages = valueOf(STEP.get("ages")!, f) as string[];
  const participants = valueOf(STEP.get("participants")!, f) as string[];
  const education = (valueOf(STEP.get("education")!, f) as string) ?? "";
  const fees = f.fees.map((x) => ({ label: x.label, amount: money(x.cents) }));
  const fee = mainFee(f);
  const statement = { boxes: [box("statement_help"), box("statement_approach"), box("statement_about")], snippet: d.cardPreview || cardPreview(box("statement_help").text), snippetChars: HOOK_CHARS };
  const primary = f.address ? `${f.address.street}, ${f.address.city}, ${f.address.state} ${f.address.zip}` : place(f);
  const online = f.telehealth || formats.includes("Online") ? `Online in ${stateName(f)}` : null;
  const view: Omit<ProfileView, "sections" | "ownLabels" | "exportText"> = {
    sample: f.isSample,
    source: draft ? "draft" : "live",
    header: { name: f.name, credential: f.credential, title: titleWords(f), place: place(f), formats, phone: f.phone, email: f.email, website: f.website },
    statement,
    consult: { minutes: f.answers.freeConsultMinutes, intro: box("intro") },
    glance: {
      availability: pt.availability ? AVAILABILITY[pt.availability] : null,
      practiceName: f.practiceName,
      locations: [primary, online].filter(Boolean) as string[],
      formatLine: formats.length === 2 ? "In person and online sessions" : formats[0] === "Online" ? "Online sessions" : formats.length ? "In person sessions" : "",
      topSpecialties: pt.topSpecialties,
      feeLine: [fee ? `${fee} per session` : "", f.inNetwork.length ? "Accepts insurance" : "Out of network"].filter(Boolean).join(" · "),
      insuranceLine: f.inNetwork.length ? f.inNetwork.join(", ") : "Out of network",
      participants,
    },
    finances: { fees, slidingScale: pt.slidingScale, paymentMethods: pt.paymentMethods, insurance: f.inNetwork, outOfNetwork: !f.inNetwork.length, note: box("note_finance") },
    qualifications: {
      licenseLine: `Licensed by the State of ${stateName(f)} (${f.credential})`,
      years: f.answers.yearsInPractice,
      education,
      extraCredentials: pt.extraCredentials,
      note: box("note_credentials"),
    },
    specialties: { top: pt.topSpecialties, expertise: pt.expertise.filter((x) => !pt.topSpecialties.includes(x)), note: box("note_top_specialties") },
    clientFocus: { ages, participants, communities: pt.communities, faith: pt.faith, languages: f.answers.languages },
    treatment: { types: pt.therapyTypes, note: box("note_therapy_types") },
    location: { primary, online, nearby: pt.nearby },
  };
  const known = new Set(Object.values(PT_LISTS).flatMap((l) => l.options));
  const ownLabels = [...pt.topSpecialties, ...pt.expertise, ...pt.therapyTypes, ...pt.communities, ...pt.faith, ...pt.paymentMethods].filter((x) => !known.has(x));
  const sections = sectionCopies(view);
  return { ...view, ownLabels: [...new Set(ownLabels)], sections, exportText: exportAll({ header: view.header, sample: view.sample, sections }) };
}

const yesNo = (b: boolean | null) => (b === null ? "" : b ? "Yes" : "No");
const tick = (label: string, xs: string[]) => (xs.length ? `${label}: ${xs.join(", ")}` : "");
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The words of each section as she pastes or ticks them, in profile order. */
function sectionCopies(v: Omit<ProfileView, "sections" | "ownLabels" | "exportText">): ProfileView["sections"] {
  const copy: Record<SectionId, string> = {
    header: lines(`${v.header.name}, ${v.header.credential}`, v.header.title, v.header.place),
    statement: v.statement.boxes.map((b) => b.text).filter(Boolean).join("\n\n"),
    photos: "Upload a clear, friendly photo of you in the Psychology Today editor.",
    consult: lines(v.consult.minutes ? `Free consultation: on (${v.consult.minutes} minutes)` : "Free consultation: off", v.consult.intro.text),
    glance: lines(
      v.glance.availability,
      v.glance.practiceName,
      ...v.glance.locations,
      v.glance.formatLine,
      v.glance.topSpecialties.length > 0 && `I specialize in ${andList(v.glance.topSpecialties)}`,
      v.glance.feeLine,
      tick("I see", v.glance.participants),
    ),
    finances: lines(
      ...v.finances.fees.map((x) => `${x.label}: ${x.amount}`),
      v.finances.slidingScale !== null && `Sliding scale: ${yesNo(v.finances.slidingScale)}`,
      tick("Payment methods", v.finances.paymentMethods),
      `Insurance: ${v.finances.outOfNetwork ? "Out of Network" : v.finances.insurance.join(", ")}`,
      v.finances.note.text && `\n${v.finances.note.text}`,
    ),
    qualifications: lines(
      v.qualifications.licenseLine,
      v.qualifications.years !== null && `Years in practice: ${v.qualifications.years}`,
      v.qualifications.education && `Education: ${v.qualifications.education}`,
      v.qualifications.extraCredentials && `Additional credentials: ${v.qualifications.extraCredentials}`,
      v.qualifications.note.text && `\n${v.qualifications.note.text}`,
    ),
    specialties: lines(tick("Top specialties", v.specialties.top), tick("Expertise", v.specialties.expertise), v.specialties.note.text && `\n${v.specialties.note.text}`),
    endorsements: "Endorsements come from other Psychology Today members. Ask a colleague who knows your work to endorse you.",
    clientFocus: lines(tick("Age", v.clientFocus.ages), tick("Participants", v.clientFocus.participants), tick("Communities", v.clientFocus.communities), tick("Faith", v.clientFocus.faith), v.clientFocus.languages && `I also speak: ${v.clientFocus.languages}`),
    treatment: lines(tick("Types of therapy", v.treatment.types), v.treatment.note.text && `\n${v.treatment.note.text}`),
    location: lines(`Primary location: ${v.location.primary}`, v.location.online, v.location.nearby && `Nearby areas: ${v.location.nearby}`),
  };
  return SECTIONS.map((s) => ({ id: s.id, title: s.title, copy: copy[s.id] }));
}

/** Every section in profile order, ready to paste into a note before she fills in the editor. */
export function exportAll(v: Pick<ProfileView, "header" | "sample" | "sections">): string {
  const head = `Psychology Today profile for ${v.header.name}, ${v.header.credential}${v.sample ? " (fictional demo practice)" : ""}\n${MAKE_IT_YOURS} before you paste it.`;
  return [head, ...v.sections.map((s) => `${s.title.toUpperCase()}\n${s.copy}`)].join("\n\n");
}
