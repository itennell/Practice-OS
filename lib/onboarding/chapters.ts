// Aeon's onboarding interview: 8 chapters, one question per screen. Pure data, no
// database: lib/onboarding/store.ts saves each answer with the writer that already
// owns it (AGENTS.md > How the clinician uses it). Questions that don't apply to her
// are left out by `appliesWhen`, so the progress line counts only her questions.
//
// Never asked, anywhere: a license number, SSN, date of birth, bank details or
// anything about a client.

import type { HelperQuestion } from "./helper-questions";

export const CHAPTERS = [
  { id: "you", title: "You and your practice" },
  { id: "license", title: "License and rules" },
  { id: "money", title: "Fees, insurance and hours" },
  { id: "clients", title: "Who you help" },
  { id: "stage", title: "Stage" },
  { id: "tools", title: "Connect your tools" },
  { id: "asks", title: "How Aeon asks before acting" },
  { id: "team", title: "Your team" },
] as const;
export type ChapterId = (typeof CHAPTERS)[number]["id"];

export type Credential = "LCSW" | "LCPC" | "LMFT" | "Psychologist";
export type Stage = "beginning" | "middle" | "late";

/** What earlier answers say, for deciding which questions apply. */
export type Ctx = {
  state: string | null;
  credential: Credential | null;
  stage: Stage | null;
  seesClients: "in_person" | "telehealth" | "both" | null;
  insurance: "self_pay" | "some" | "planning" | null;
  firstRenewal: boolean | null;
  medicare: "enrolled" | "opted_out" | "none" | null;
  medicaid: boolean | null;
  officeZip: string | null;
};

export type Kind =
  | "name"
  | "text"
  | "contact"
  | "phone"
  | "state"
  | "license"
  | "choice"
  | "yesno"
  | "yesno_date"
  | "date"
  | "number"
  | "ce"
  | "staff"
  | "medicare"
  | "address"
  | "npi"
  | "ein"
  | "malpractice"
  | "office_days"
  | "fees"
  | "payers"
  | "setup"
  | "who"
  | "followups"
  | "connect"
  | "mode"
  | "team"
  | "helper"
  | "slot";

export type Option = { value: string; label: string; hint?: string };

export type Question = {
  id: string;
  chapter: ChapterId;
  kind: Kind;
  /** The question, in plain words. {license} and {state} are filled in. */
  ask: string;
  help?: string;
  /** What Aeon says in her speech bubble on this screen. */
  aeonSays: string;
  options?: Option[];
  /** For "who": the second group of chips (how she works). */
  workOptions?: Option[];
  /** For yesno_date: the date question shown after "Yes". */
  dateAsk?: string;
  /** Ask the date only when this holds (defaults to always). */
  dateWhen?: (c: Ctx) => boolean;
  /** Only the name can't be skipped: every form and greeting needs it. */
  required?: boolean;
  /** Shown on "Still to set up" when skipped: what can't work without it. */
  blocks?: string;
  appliesWhen?: (c: Ctx) => boolean;
};

const insured = (c: Ctx) => c.insurance === "some" || c.insurance === "planning";
const isIL = (c: Ctx) => c.state === "IL";
const psychologist = (c: Ctx) => c.credential === "Psychologist";

export const LICENSE_OPTIONS: Option[] = [
  { value: "LCSW", label: "LCSW", hint: "Clinical social worker" },
  { value: "LCPC", label: "LCPC or LPC", hint: "Professional counselor" },
  { value: "LMFT", label: "LMFT", hint: "Marriage and family therapist" },
  { value: "Psychologist", label: "Psychologist", hint: "Licensed clinical psychologist" },
];

export const STAGE_OPTIONS: Option[] = [
  { value: "beginning", label: "Beginning", hint: "I'm just opening my practice." },
  { value: "middle", label: "Middle", hint: "I'm building my caseload." },
  { value: "late", label: "Late", hint: "My practice is established and mostly full." },
];

export const MODE_OPTIONS: Option[] = [
  { value: "manual", label: "Ask me first, every time", hint: "Aeon asks before it does anything." },
  { value: "auto", label: "Do small things, ask about the rest", hint: "Aeon does routine work and asks about anything that goes out." },
  { value: "bypass", label: "Do everything you can", hint: "Aeon only stops for things only you can send." },
];

export const QUESTIONS: Question[] = [
  // 1 · You and your practice. Name, state and license come first: her profile can't
  // be saved without them, and everything after it saves as she goes.
  {
    id: "name",
    chapter: "you",
    kind: "name",
    ask: "What's your name?",
    help: "The way you'd like it on forms, like Dana Reyes.",
    aeonSays: "Hi, I'm Aeon. I help run the business side of your practice. This takes about 20 minutes. You can stop any time and pick up where you left off.",
    required: true,
  },
  {
    id: "practice_name",
    chapter: "you",
    kind: "text",
    ask: "What's your practice called?",
    help: "If it doesn't have a name, skip this. I'll use your name.",
    aeonSays: "This goes on your estimates and superbills.",
  },
  {
    id: "state",
    chapter: "you",
    kind: "state",
    ask: "Which state do you practice in?",
    aeonSays: "Rules and deadlines depend on your state.",
    blocks: "Deadlines need your state.",
  },
  {
    id: "license",
    chapter: "you",
    kind: "license",
    ask: "What kind of license do you have?",
    help: "Just the type. I never need your license number.",
    aeonSays: "Your license type tells me which renewals and classes apply to you.",
    options: LICENSE_OPTIONS,
    blocks: "Deadlines need your license type.",
  },
  {
    id: "contact",
    chapter: "you",
    kind: "contact",
    ask: "How do clients reach your practice?",
    help: "Your practice email and the phone number clients call. Clients use the email to ask for a Good Faith Estimate.",
    aeonSays: "I put these on the forms clients get.",
  },
  {
    id: "sees_clients",
    chapter: "you",
    kind: "choice",
    ask: "Where do you see clients?",
    aeonSays: "This sets the place of service on your superbills.",
    options: [
      { value: "in_person", label: "In my office" },
      { value: "telehealth", label: "By video (telehealth)" },
      { value: "both", label: "Both" },
    ],
  },
  {
    id: "office",
    chapter: "you",
    kind: "address",
    ask: "What's your office address?",
    help: "If you only see clients by video, use the address where your practice gets mail.",
    aeonSays: "Estimates, superbills and release forms all need it.",
    blocks: "Good Faith Estimates and superbills need an address.",
  },
  {
    id: "alert_phone",
    chapter: "you",
    kind: "phone",
    ask: "What's your own cell phone number?",
    help: "Only for urgent alerts, like when a caller says they're in danger. It's never shared.",
    aeonSays: "If something urgent comes in, I text you right away.",
    blocks: "Urgent alerts need your cell number.",
  },

  // 2 · License and rules
  {
    id: "license_expires",
    chapter: "license",
    kind: "date",
    ask: "When does your {license} license expire?",
    help: "It's printed on your license. Type it, or pick it from the calendar.",
    aeonSays: "I'll remind you well before it's due.",
    blocks: "Your renewal reminder needs this date.",
  },
  {
    id: "ce",
    chapter: "license",
    kind: "ce",
    ask: "Will this be your first time renewing this license?",
    help: "If not, tell me about how many hours of continuing education you've done since you last renewed. A guess is fine.",
    aeonSays: "Some states don't ask for classes on a first renewal. Otherwise I'll track how many hours you still need.",
  },
  {
    id: "adults_26",
    chapter: "license",
    kind: "yesno",
    ask: "Do you see clients who are 26 or older?",
    aeonSays: "Illinois asks for a dementia class if you do.",
    appliesWhen: isIL,
  },
  {
    id: "psypact",
    chapter: "license",
    kind: "yesno_date",
    ask: "Do you have a PSYPACT telehealth authorization (APIT)?",
    dateAsk: "When was it granted?",
    aeonSays: "It comes with its own renewal.",
    appliesWhen: psychologist,
  },
  {
    id: "qualified_examiner",
    chapter: "license",
    kind: "yesno",
    ask: "Are you a qualified examiner under Illinois law?",
    aeonSays: "If you are, there is one more rule to follow.",
    appliesWhen: (c) => psychologist(c) && isIL(c),
  },
  {
    id: "npi",
    chapter: "license",
    kind: "npi",
    ask: "What's your NPI number?",
    help: "It's 10 digits. If you don't know it, skip this and I'll help you look it up later.",
    aeonSays: "I'll check it against the national registry for you.",
    blocks: "Good Faith Estimates and superbills need your NPI.",
  },
  {
    id: "pllc",
    chapter: "license",
    kind: "yesno_date",
    ask: "Is your practice set up as a PLLC or LLC?",
    dateAsk: "When was it formed?",
    aeonSays: "Businesses like that have a yearly report.",
  },
  {
    id: "entity_tax",
    chapter: "license",
    kind: "choice",
    ask: "How does your practice file taxes?",
    help: "If you're not sure, skip this.",
    aeonSays: "This tells me which tax deadlines are yours.",
    options: [
      { value: "single_owner", label: "Just me, on my own taxes", hint: "Sole owner (Schedule C)" },
      { value: "partnership", label: "As a partnership" },
      { value: "s_corp", label: "As an S corporation" },
    ],
  },
  {
    id: "ein",
    chapter: "license",
    kind: "ein",
    ask: "What's your practice's tax ID (EIN)?",
    help: "It looks like 12-3456789. Never your Social Security number.",
    aeonSays: "Estimates and superbills need it.",
    blocks: "Good Faith Estimates and superbills need your tax ID.",
  },
  {
    id: "staff",
    chapter: "license",
    kind: "staff",
    ask: "Does anyone work for you?",
    help: "Employees don't include you. Contractors are people like a biller or a bookkeeper you pay by the job.",
    aeonSays: "Employer rules and 1099 forms only apply if you have help.",
  },
  {
    id: "malpractice",
    chapter: "license",
    kind: "malpractice",
    ask: "Who is your malpractice insurance with?",
    aeonSays: "Insurers and CAQH ask for this.",
  },
  {
    id: "setup",
    chapter: "license",
    kind: "setup",
    ask: "Which of these do you already have?",
    help: "Tap one answer for each. Not sure? Pick \"Not yet\" and I'll remind you.",
    aeonSays: "These aren't deadlines, just things every practice should have.",
  },

  // 3 · Fees, insurance and hours
  {
    id: "office_days",
    chapter: "money",
    kind: "office_days",
    ask: "Which days is your practice open?",
    aeonSays: "Estimates are due a number of business days after someone asks, so I count only your open days.",
  },
  {
    id: "fees",
    chapter: "money",
    kind: "fees",
    ask: "What do you charge clients who pay themselves?",
    help: "Leave a box empty if you don't offer it.",
    aeonSays: "I use these to fill in estimates and superbills.",
    blocks: "Good Faith Estimates need your fees.",
  },
  {
    id: "insurance",
    chapter: "money",
    kind: "choice",
    ask: "Do you take insurance?",
    aeonSays: "Taking insurance comes with a few more rules.",
    options: [
      { value: "self_pay", label: "No, clients pay me themselves" },
      { value: "some", label: "Yes, I take some insurance" },
      { value: "planning", label: "Not yet, but I plan to" },
    ],
  },
  {
    id: "payers",
    chapter: "money",
    kind: "payers",
    ask: "Which insurers are you with or applying to?",
    help: "Pick all that apply. You can add more later.",
    aeonSays: "I'll track follow-ups and recredentialing dates for each one.",
    appliesWhen: insured,
  },
  {
    id: "bcbsil",
    chapter: "money",
    kind: "yesno",
    ask: "Are you in network with Blue Cross Blue Shield of Illinois?",
    aeonSays: "Blue Cross asks you to check your listing and renew every few years.",
    appliesWhen: (c) => insured(c) && isIL(c),
  },
  {
    id: "medicare",
    chapter: "money",
    kind: "medicare",
    ask: "Are you set up with Medicare?",
    help: "If you're enrolled or opted out, add the date from your Medicare letter if you have it.",
    aeonSays: "Medicare has its own dates, even if you never bill it.",
    options: [
      { value: "enrolled", label: "Yes, I'm enrolled", hint: "Revalidation due date" },
      { value: "opted_out", label: "I opted out", hint: "Opt-out end date" },
      { value: "none", label: "No" },
    ],
  },
  {
    id: "medicaid",
    chapter: "money",
    kind: "yesno_date",
    ask: "Are you enrolled with Medicaid?",
    dateAsk: "When is your IMPACT revalidation due?",
    dateWhen: isIL,
    help: "IMPACT is Illinois Medicaid's enrollment system. Skip the date if you don't know it.",
    aeonSays: "Medicaid asks you to sign up again every few years.",
    appliesWhen: insured,
  },
  {
    id: "caqh",
    chapter: "money",
    kind: "date",
    ask: "When did you last attest your CAQH profile?",
    help: "Skip if you don't have a CAQH profile yet.",
    aeonSays: "CAQH asks you to attest every 120 days.",
    appliesWhen: (c) => c.insurance === "some",
  },

  // 4 · Who you help
  {
    id: "who",
    chapter: "clients",
    kind: "who",
    ask: "Who do you help, and how do you like to work?",
    help: "Tap all that fit, and add your own words if you like. Please don't name any client.",
    aeonSays: "This helps me find the right referral sources and answer callers' questions.",
    options: [
      { value: "Children", label: "Children" },
      { value: "Teens", label: "Teens" },
      { value: "Adults", label: "Adults" },
      { value: "Older adults", label: "Older adults" },
      { value: "Couples", label: "Couples" },
      { value: "Families", label: "Families" },
      { value: "Groups", label: "Groups" },
    ],
    workOptions: [
      { value: "Weekday daytimes", label: "Weekday daytimes" },
      { value: "Evenings", label: "Evenings" },
      { value: "Weekends", label: "Weekends" },
      { value: "Short-term work", label: "Short-term" },
      { value: "Long-term work", label: "Long-term" },
      { value: "Sliding scale spots", label: "Sliding scale spots" },
    ],
  },
  {
    id: "followups",
    chapter: "clients",
    kind: "followups",
    ask: "A few more questions",
    help: "Only about the business side. Please don't include anything about a client.",
    aeonSays: "Thanks. I have a few more questions so I can help with the business side.",
  },

  // 5 · Stage
  {
    id: "stage",
    chapter: "stage",
    kind: "choice",
    ask: "Where is your practice right now?",
    aeonSays: "This tells me where to start.",
    options: STAGE_OPTIONS,
  },

  // 6 · Connect your tools. Each helper session adds its own questions after these
  // (lib/onboarding/helper-questions.ts); they're slotted in by flatten().
  {
    id: "connect",
    chapter: "tools",
    kind: "connect",
    ask: "Connect your tools",
    help: "Each one is a single button. You can do any of these later in Settings.",
    aeonSays: "Connect what you already use, and I'll do the busywork in it.",
  },
  {
    id: "uses_texting",
    chapter: "tools",
    kind: "yesno",
    ask: "Do you text clients, or want to?",
    help: "For things like reminders and booking, never therapy.",
    aeonSays: "Texting from a business number has a few rules. I'll keep track of them.",
  },

  // 7 · How Aeon asks before acting
  {
    id: "mode",
    chapter: "asks",
    kind: "mode",
    ask: "How should I ask before I do things?",
    help: "You can change this any time, even for one chat.",
    aeonSays: "Nothing goes to a client, an insurer or Instagram unless your setting allows it.",
    options: MODE_OPTIONS,
  },
  {
    id: "text_missed_callers",
    chapter: "asks",
    kind: "yesno",
    ask: "When you miss a call, may I text the caller your open consult times?",
    help: "Only times and booking, never advice. You can turn this off later.",
    aeonSays: "This is your Front Desk's own rule.",
  },

  // 8 · Your team
  {
    id: "team",
    chapter: "team",
    kind: "team",
    ask: "Meet your team",
    help: "Each helper works for you, and I keep an eye on all of them.",
    aeonSays: "Here's who helps you, and who starts first.",
  },
];

/** A question as the screen gets it: no functions, words filled in. */
export type Screen = {
  id: string;
  chapter: ChapterId;
  kind: Kind;
  ask: string;
  help?: string;
  aeonSays: string;
  options?: Option[];
  workOptions?: Option[];
  dateAsk?: string;
  required?: boolean;
  /** Set for questions a helper session added. */
  helper?: { helper: string; question: HelperQuestion };
};

const LICENSE_WORD: Record<Credential, string> = { LCSW: "LCSW", LCPC: "LCPC", LMFT: "LMFT", Psychologist: "psychologist" };

function fill(text: string, c: Ctx, states: Record<string, string>): string {
  return text
    .replace("{license}", c.credential ? LICENSE_WORD[c.credential] : "")
    .replace("{state}", c.state ? (states[c.state] ?? c.state) : "your state")
    .replace(/\s{2,}/g, " ");
}

/**
 * The questions she'll see, in order, with the ones that don't apply left out and
 * each helper session's questions slotted in after "Do you text clients?". `extra`
 * lets another session drop in a whole screen (the Muse key step goes after "name").
 */
export function flatten(
  c: Ctx,
  opts: {
    states?: Record<string, string>;
    helpers?: { helper: string; questions: HelperQuestion[] }[];
    extra?: { after: string; screen: Screen }[];
    basics?: Parameters<NonNullable<HelperQuestion["appliesWhen"]>>[0];
  } = {},
): Screen[] {
  const states = opts.states ?? {};
  const out: Screen[] = [];
  for (const q of QUESTIONS) {
    if (q.appliesWhen && !q.appliesWhen(c)) continue;
    out.push({
      id: q.id,
      chapter: q.chapter,
      kind: q.kind,
      ask: fill(q.ask, c, states),
      aeonSays: q.aeonSays,
      options: q.options,
      workOptions: q.workOptions,
      dateAsk: q.dateWhen && !q.dateWhen(c) ? undefined : q.dateAsk,
      help: q.dateWhen && !q.dateWhen(c) ? undefined : q.help,
      required: q.required,
    });
    if (q.id === "uses_texting") {
      for (const block of opts.helpers ?? []) {
        for (const hq of block.questions) {
          if (hq.appliesWhen && opts.basics && !hq.appliesWhen(opts.basics)) continue;
          out.push({
            id: `${block.helper}:${hq.id}`,
            chapter: "tools",
            kind: "helper",
            ask: hq.ask,
            help: hq.help,
            aeonSays: HELPER_SAYS[block.helper] ?? "One more setup question for your team.",
            helper: { helper: block.helper, question: hq },
          });
        }
      }
    }
    for (const x of opts.extra ?? []) if (x.after === q.id) out.push(x.screen);
  }
  return out;
}

const HELPER_SAYS: Record<string, string> = {
  referrals: "This is for your Referrals helper.",
  instagram: "This is for your Instagram helper.",
  front_desk: "This is for your Front Desk.",
  admin: "This is for your Admin helper.",
};

/** "License and rules · question 2 of 11", counting only her questions. */
export function progressFor(screens: Screen[], index: number): { chapter: ChapterId; chapterNumber: number; at: number; of: number } {
  const s = screens[Math.max(0, Math.min(index, screens.length - 1))];
  const inChapter = screens.filter((x) => x.chapter === s.chapter);
  return {
    chapter: s.chapter,
    chapterNumber: CHAPTERS.findIndex((ch) => ch.id === s.chapter) + 1,
    at: inChapter.findIndex((x) => x.id === s.id) + 1,
    of: inChapter.length,
  };
}

/** Which helpers start first for her stage (AGENTS.md > How the clinician uses it). */
export type HelperId = "admin" | "referrals" | "instagram" | "front_desk";
export const HELPERS: { id: HelperId; name: string; does: string }[] = [
  { id: "admin", name: "Admin", does: "Keeps your deadlines, forms and insurance sign-ups on track" },
  { id: "referrals", name: "Referrals", does: "Finds local referral sources and drafts letters for you to send" },
  { id: "instagram", name: "Instagram", does: "Plans and drafts posts about booking, fees and your first session" },
  { id: "front_desk", name: "Front Desk", does: "Answers missed calls and texts with consult times" },
];

export function firstFor(stage: Stage | null): { helpers: HelperId[]; focus: string } {
  switch (stage) {
    case "middle":
      return { helpers: ["referrals", "instagram", "front_desk"], focus: "You're building your caseload, so I'll start with referrals, Instagram and your Front Desk." };
    case "late":
      return { helpers: ["front_desk", "admin"], focus: "Your practice is established, so I'll start with your Front Desk, your deadlines and a waitlist." };
    default:
      return { helpers: ["admin", "referrals"], focus: "You're just opening, so I'll start with setup, credentialing prep and finding referral sources." };
  }
}

/** The NUCC taxonomy code for each license type (NPPES uses it). */
export const TAXONOMY: Record<Credential, string> = {
  LCSW: "1041C0700X",
  LCPC: "101YP2500X",
  LMFT: "106H00000X",
  Psychologist: "103TC0700X",
};

/**
 * An EIN exactly as the IRS writes it, 12-3456789. A Social Security number
 * (123-45-6789) is refused by name: Practice-OS never stores one. Nine digits with no
 * dash could be either, so she's asked to type the dash.
 */
export function checkEin(input: string): { ok: true; ein: string } | { ok: false; reason: "ssn" | "shape" } {
  const t = input.trim();
  if (/^\d{2}-\d{7}$/.test(t)) return { ok: true, ein: t };
  if (/^\d{3}[- ]\d{2}[- ]\d{4}$/.test(t)) return { ok: false, reason: "ssn" };
  return { ok: false, reason: "shape" };
}

/** "+13125550100" from a US number she typed, or null. */
export function normalizeUsPhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return /^[2-9]\d{9}$/.test(d) ? `+1${d}` : null;
}

/** Her time zone from her state; states split across zones get the zone most people live in. */
export function timezoneFor(state: string | null): string {
  const zones: Record<string, string[]> = {
    "America/New_York": ["CT", "DC", "DE", "FL", "GA", "IN", "KY", "MA", "MD", "ME", "MI", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "SC", "VA", "VT", "WV"],
    "America/Chicago": ["AL", "AR", "IA", "IL", "KS", "LA", "MN", "MO", "MS", "ND", "NE", "OK", "SD", "TN", "TX", "WI"],
    "America/Denver": ["CO", "ID", "MT", "NM", "UT", "WY"],
    "America/Phoenix": ["AZ"],
    "America/Los_Angeles": ["CA", "NV", "OR", "WA"],
    "America/Anchorage": ["AK"],
    "Pacific/Honolulu": ["HI"],
  };
  for (const [tz, list] of Object.entries(zones)) if (state && list.includes(state)) return tz;
  return "America/Chicago";
}
