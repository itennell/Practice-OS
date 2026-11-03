// The call script on a Referrals partner (Partners tab › Call script): what to say when
// she phones an office, in three versions (the front desk, the provider, a voicemail).
// Plain code from fixed templates and her own settings (name, practice, niche, who she
// helps, insurance and fees). No model call. Every line goes through the value check
// (value-check.ts, speaker "her"): a line that offers anything of value is left out,
// so the script never trades anything for a referral. Pure: the page builds it.
import { valueOffered } from "./value-check";

export type ScriptVariant = "front_desk" | "provider" | "voicemail";
export const SCRIPT_VARIANTS: { id: ScriptVariant; label: string }[] = [
  { id: "front_desk", label: "Front desk" },
  { id: "provider", label: "Provider" },
  { id: "voicemail", label: "Voicemail" },
];

/** Her practice, as the script says it (lib/referrals/crm.ts scriptFacts loads it). */
export type ScriptFacts = {
  name: string | null;
  credential: string | null;
  practice: string | null;
  /** "Lincoln Park, Chicago". */
  place: string | null;
  phone: string | null;
  email: string | null;
  /** Her niche as who she helps ("people grieving a loss"), or null. */
  niche: string | null;
  /** The groups she sees ("adults", "couples"). */
  whoSheHelps: string[];
  /** Insurers that approved her: the only ones named as in network. */
  inNetwork: string[];
  /** Applied and waiting: named only as pending. */
  appliedPending: string[];
  /** She listed fees for clients who pay her themselves. */
  privatePay: boolean;
  slidingScale: boolean | null;
  telehealth: boolean;
  /** The fictional demo practice. */
  isSample: boolean;
};

/** The partner she is calling. `greeting` is "Dr. Tellez" or "the Quillmere Oncology Group team" (outreach.ts salutationFor). */
export type ScriptPartner = { name: string; greeting: string; organization?: boolean };

export type ScriptSectionId = "open" | "who" | "ask" | "write_down";
export type ScriptSection = { id: ScriptSectionId; title: string; lines: string[] };
export type CallScript = { variant: ScriptVariant; sections: ScriptSection[]; text: string; /** Lines the value check left out. */ left_out: number };

const TITLES: Record<ScriptSectionId, string> = { open: "Open", who: "Who you help", ask: "The ask", write_down: "Write down" };

/** "a, b and c". */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function intro(f: ScriptFacts): string {
  const who = [f.name, f.credential].filter(Boolean).join(", ");
  const at = f.practice ? ` with ${f.practice}` : "";
  const where = f.place ? ` in ${f.place}` : "";
  return who ? `${who}${at}${where}` : `a therapist${at}${where}`;
}

function whoLines(f: ScriptFacts): string[] {
  const lines: string[] = [];
  if (f.niche) lines.push(`I work with ${f.niche}.`);
  else if (f.whoSheHelps.length) lines.push(`I see ${listWords(f.whoSheHelps)}.`);
  else lines.push("I see adults for counseling.");
  if (f.niche && f.whoSheHelps.length) lines.push(`I see ${listWords(f.whoSheHelps)}.`);
  if (f.inNetwork.length) lines.push(`I'm in network with ${listWords(f.inNetwork)}.`);
  if (f.appliedPending.length) lines.push(`My application with ${listWords(f.appliedPending)} is pending.`);
  if (f.privatePay || !f.inNetwork.length) {
    lines.push(
      f.slidingScale
        ? "Clients can also pay me directly, and I have a sliding scale. I give a superbill for out-of-network benefits."
        : "Clients can also pay me directly, and I give a superbill for out-of-network benefits.",
    );
  }
  if (f.telehealth) lines.push("I see clients in person and by telehealth.");
  return lines;
}

const WRITE_DOWN = ["Who handles referrals:", "How they refer (fax, portal, email or phone):", "Best time to call:"];

function sectionsFor(f: ScriptFacts, p: ScriptPartner, v: ScriptVariant): ScriptSection[] {
  const me = intro(f);
  const reach = [f.phone, f.email].filter(Boolean).join(" or ");
  if (v === "front_desk") {
    return [
      { id: "open", title: TITLES.open, lines: [`Hi, my name is ${me}.`, "I'm calling to introduce my practice. Is there someone who handles referrals I could speak with?"] },
      { id: "who", title: TITLES.who, lines: whoLines(f) },
      {
        id: "ask",
        title: TITLES.ask,
        lines: ["How do you usually refer for counseling?", "Who is the best person to send my information to?", "Would a short email with my details help?"],
      },
      { id: "write_down", title: TITLES.write_down, lines: WRITE_DOWN },
    ];
  }
  if (v === "provider") {
    const hi = p.organization ? "Hi," : `Hi ${p.greeting},`;
    return [
      { id: "open", title: TITLES.open, lines: [`${hi} I'm ${me}. I'll keep this short.`, "I'm reaching out to doctors and clinicians near my office so you know who I am."] },
      { id: "who", title: TITLES.who, lines: whoLines(f) },
      {
        id: "ask",
        title: TITLES.ask,
        lines: ["How do you usually refer for counseling?", "What do your patients most often need from a therapist?", "Who on your team should I stay in touch with?"],
      },
      { id: "write_down", title: TITLES.write_down, lines: [...WRITE_DOWN, "What they need from a therapist:"] },
    ];
  }
  return [
    { id: "open", title: TITLES.open, lines: [`Hi, this is ${me}.`, `I'm calling for ${p.organization ? `the ${p.greeting}` : `${p.greeting}'s office`} to introduce my practice.`] },
    { id: "who", title: TITLES.who, lines: whoLines(f).slice(0, 2) },
    {
      id: "ask",
      title: TITLES.ask,
      lines: [
        "I'd like to learn how your office usually refers for counseling.",
        reach ? `You can reach me at ${reach}.` : "I'll try you again later this week.",
        `Again, this is ${f.name ?? "the therapist"}${f.phone ? ` at ${f.phone}` : ""}. Thank you.`,
      ],
    },
    { id: "write_down", title: TITLES.write_down, lines: ["When you left the message:", "Call back by (about a week out):"] },
  ];
}

/** The script, every line checked. A line offering anything of value never reaches her. */
export function buildCallScript(facts: ScriptFacts, partner: ScriptPartner, variant: ScriptVariant): CallScript {
  let leftOut = 0;
  const sections = sectionsFor(facts, partner, variant).map((s) => ({
    ...s,
    lines: s.lines.filter((line) => {
      const offered = valueOffered(line, { speaker: "her" });
      if (offered) leftOut++;
      return !offered;
    }),
  }));
  const label = SCRIPT_VARIANTS.find((x) => x.id === variant)!.label;
  const text = [
    `Call script: ${partner.name} (${label})`,
    ...sections.map((s) => `${s.title}\n${s.lines.map((l) => (s.id === "write_down" ? `- ${l} ____` : `- ${l}`)).join("\n")}`),
  ].join("\n\n");
  return { variant, sections, text, left_out: leftOut };
}
