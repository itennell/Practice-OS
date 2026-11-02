// The crisis check (AGENTS.md > Illinois HB 1806 and > Approvals). Plain code,
// no model: it runs before any model call on every chat message, and later on
// every Front Desk text and voicemail transcript. Any mention of self-harm,
// suicide or danger gets CRISIS_REPLY. It never judges intent, so a negation
// ("not suicidal") routes too, and it never echoes the message back.

export const CRISIS_REPLY =
  "If you or someone else is in danger, call or text 988 (Suicide & Crisis Lifeline) now. " +
  "For an emergency, call 911. I'm an AI assistant for practice logistics and can't help with this.";

export type CrisisCategory = "self_harm" | "harm_to_others" | "danger";
export type CrisisResult = { crisis: false } | { crisis: true; category: CrisisCategory };

// Matched against the message with every space and symbol removed, so
// "kill my self", "k i l l myself" and "self-harm" all match. Includes basic
// Spanish, Portuguese, French and German phrases (accents are folded away).
// "suicid" is not here: it is checked below so a practice task about suicide
// risk can pass, while "I'm suicidal" still routes.
const SQUASHED: Record<CrisisCategory, string[]> = {
  self_harm: [
    "killmyself", "killherself", "killhimself", "killthemselves",
    "selfharm", "selfinjur",
    "hurtmyself", "hurtherself", "hurthimself", "cutmyself", "cuttingmyself", "cuttingherself",
    "endmylife", "endmyownlife", "endherlife", "endhislife", "endtheirlife", "enditall",
    "endingitall", "endingmylife", "endingmyownlife",
    "takemylife", "takemyownlife", "takeherlife", "takehislife", "takingmylife", "takingmyownlife",
    "overdose", "toomanypills", "hangmyself", "hangherself", "hanghimself",
    "wanttodie", "wantstodie", "wantedtodie", "wantingtodie", "wanttobedead", "wantstobedead",
    "betteroffdead", "betteroffwithoutme", "noreasontolive", "nothingtolivefor", "nopointinliving", "nopointliving",
    "dontwanttobehereanymore", "dontwanttoliveanymore", "dontwanttolive", "dontwanttowakeup",
    "dontwannabehereanymore", "dontwannalive", "dontwannabealive", "dontwanttoexist", "dontwannaexist",
    "cantgoonliving", "wantittobeover",
    // Spanish
    "quieromorir", "deseomorir", "ganasdemorir", "noquierovivir", "noquieroseguirviviendo",
    "mevoyamatar", "voyamatarme", "quieromatarme", "matarme", "quitarmelavida", "mequitolavida",
    "lastimarme", "hacermedano", "autolesion",
    // Portuguese
    "queromorrer", "naoqueroviver", "voumematar", "queromematar", "tirarminhavida", "automutila",
    // French
    "veuxmourir", "enviedemourir", "jevaismetuer", "veuxmetuer", "veuxenfinir", "mefairedumal",
    // German
    "willsterben", "mochtesterben", "willnichtmehrleben", "bringmichum", "bringemichum", "michumbringen",
    "michumzubringen", "michtoten", "selbstmord", "selbstverletz",
  ],
  harm_to_others: [
    "killhim", "killher", "killthem", "killyou", "killsomeone", "killeveryone", "killme",
    "hurtsomeone", "hurtme", "hurtmykids", "hurtthekids", "hurtmychild",
    "shoothim", "shoother", "shootthem", "shootsomeone", "shootmyself",
    "matarte", "matarlo", "matarla",
  ],
  danger: ["indanger", "notsafe", "unsafeathome", "threateningto", "threatenedto", "threateningme"],
};

// Matched as whole words on the spaced-out message.
const WORDS: Record<CrisisCategory, RegExp[]> = {
  self_harm: [
    /\bjump(ing)? off (the|a) (bridge|building|roof|cliff)\b/,
    /\bunaliv(e|ed|ing)\b/,
    /\bwanna die\b/,
    /\bkms\b/,
    /\bkys\b/,
    // Spaced, so "I wish I was deadline-free" passes.
    /\bwish i (was|were) dead\b/,
    /\b(dont|do not) want to be alive\b/,
    // "disappear into a book" is a weekend plan, not ideation.
    /\b(want to|wanna) disappear\b(?! into (a|an|the|my|our|some) (book|books|novel|movie|film|show|series|game|project|work|garden|kitchen|woods|forest|mountains|beach|cabin|vacation|trip|music|studio|library)\b)/,
    // Implicit ending: "I want to end it", "going to end it tonight".
    /\b(want to|wanna|going to|gonna|ready to|about to|planning to|plan to|thinking about|thinking of) end(ing)? (it|everything|things)( all)?( (tonight|today|now|soon|already|for good))?$/,
    /\bend(ing)? (it|everything) (tonight|today|right now|for good)\b/,
    // Overdose without the word: "took a bunch of pills", "took too many of my pills".
    /\b(took|take|taken|taking|swallowed|swallow) (a (bunch|lot|handful|ton|bottle) of|too many( of)?|all( of)?|every one of|(the|a) whole bottle of)( (my|the|those|these|her|his))?( \w+)? (pills|tablets|meds|medication)\b/,
    // Can't go on, at the end or with "hopeless" ("can't go on vacation" passes).
    /\b(cant|cannot|can not) (go on|keep going)( (anymore|any more|like this|living))?$/,
    /\bhopeless\b.*\b(cant|cannot|can not) (go on|keep going)\b/,
    /\b(cant|cannot|can not) (go on|keep going)\b.*\bhopeless\b/,
  ],
  harm_to_others: [],
  danger: [
    // First-person abuse, violence and weapons stay crisis in any context.
    /\b(being|been|was|were|get|getting|got|am) abused\b/,
    /\babus(es|ed|ing) (me|my|us)\b/,
    /\b(my|her|his) abus(er|ive)\b/,
    /\b(i am|im|i m|been|being|living with|experiencing|suffering|victim of) (in )?(a )?domestic violence\b/,
    /\b(has|had|got|holding|grabbed|pulled|pointing|waving) (a|his|her|their) (gun|knife|weapon)\b/,
  ],
};

// Practice-task allow-list. Topic words (abuse, domestic violence, weapons,
// "suicide" as a subject) are crisis unless the message is plainly a business
// task about that topic: reporting rules, a policies or resources page, a
// hotline list, billing codes, a gun-free sign. Each family has its own narrow
// contexts, so "there's a knife, update my policy page" still routes. The
// allow-list never covers first-person ideation or danger: SQUASHED and WORDS
// above run first and always win, so "I want to kill myself, also what's the
// CPT code" and "I'm suicidal, update my policies page" are still crisis.
const REPORTING =
  /\b(report(ing)? (child |elder |suspected )?(abuse|neglect)|(abuse|neglect) report(ing|s)?|reporting (requirements?|rules?|laws?|duties|obligations?)|mandat(ed|ory) report(er|ers|ing))\b/;
const POLICY_PAGE = /\b(polic(y|ies) (page|section|document|doc|statement)|(crisis|safety|reporting) polic(y|ies))\b/;
const RESOURCES = /\b(hotlines?|lifeline|resources? (page|list|section))\b/;
const BILLING = /\b(cpt|icd|risk assessments?|risk screenings?|bill(ing)? for|billing codes?)\b/;
const TOPICS: Array<{ category: CrisisCategory; word: RegExp; contexts: RegExp[] }> = [
  { category: "danger", word: /\babus(e|ed|ing|ive)\b/, contexts: [REPORTING, POLICY_PAGE, RESOURCES] },
  { category: "danger", word: /\bdomestic violence\b/, contexts: [REPORTING, POLICY_PAGE, RESOURCES, BILLING] },
  {
    category: "danger",
    word: /\b(gun|guns|knife|knives|weapon|weapons|firearm|firearms)\b/,
    contexts: [/\b(guns?|weapons?|firearms?) free\b/, /\bno (guns|weapons|firearms)\b/, /\b(guns?|weapons?|firearms?) polic(y|ies)\b/],
  },
];
// "Suicide" as a subject: only these noun phrases are dropped, and only in a
// practice context. Any other "suicid..." ("I'm suicidal", "suicide") routes.
const SUICIDE_TOPIC =
  /\bsuicid(e|al) (prevention|risk|risks|assessments?|screenings?|polic(y|ies)|protocols?|awareness|hotlines?|lifeline|training|safety plans?|ideation (screening|assessment))\b/g;
const SUICIDE_CONTEXTS = [REPORTING, POLICY_PAGE, RESOURCES, BILLING];

// Misspellings of the two words that matter most ("suicdal", "suacidal", "sucidal").
const FUZZY_TARGETS = ["suicide", "suicidal"];

// Lookalike letters (Cyrillic and Greek) that NFKD leaves alone, so "kіll myself"
// with a Cyrillic і still reads as "kill myself".
const CONFUSABLES: Record<string, string> = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ї: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "l", һ: "h", ԛ: "q", ԝ: "w",
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x", ω: "w",
  ı: "i", ł: "l", ø: "o", ß: "ss",
};
// Leetspeak digits and symbols ("k1ll", "su1c1de", "$elf harm").
const LEET: Record<string, string> = { "1": "i", "3": "e", "0": "o", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\x00-\x7f]/g, (ch) => CONFUSABLES[ch] ?? ch)
    .replace(/[’'`]/g, "");
}

const words = (text: string) => text.replace(/[^a-z0-9]+/g, " ").trim();

/** The message folded to plain ASCII words, without and with leetspeak read as letters. */
function normalize(text: string): string[] {
  // A number then "km"/"kms" is a distance ("5 kms away"), never the slang "kms".
  const folded = fold(text).replace(/\b\d+(?:\.\d+)?\s*kms?\b/g, " ");
  const plain = words(folded);
  const leet = words(folded.replace(/[013457@$]/g, (ch) => LEET[ch]));
  return leet === plain ? [plain] : [plain, leet];
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

function nearMissSuicide(spaced: string): boolean {
  return spaced
    .split(" ")
    .some((word) => word.length >= 6 && word.startsWith("s") && FUZZY_TARGETS.some((t) => editDistance(word, t) <= 1));
}

function checkOne(spaced: string): CrisisResult {
  const squashed = spaced.replace(/ /g, "");
  // 1. Ideation, self-harm and direct danger: always crisis, whatever else is said.
  for (const category of Object.keys(SQUASHED) as CrisisCategory[]) {
    if (SQUASHED[category].some((s) => squashed.includes(s))) return { crisis: true, category };
    if (WORDS[category].some((re) => re.test(spaced))) return { crisis: true, category };
  }
  // 2. "Suicide": its topic phrases are dropped only in a practice context.
  const practice = SUICIDE_CONTEXTS.some((re) => re.test(spaced));
  const rest = practice ? spaced.replace(SUICIDE_TOPIC, " ") : spaced;
  if (rest.replace(/ /g, "").includes("suicid") || nearMissSuicide(rest)) return { crisis: true, category: "self_harm" };
  // 3. Danger topic words, unless one of that family's practice contexts is present.
  for (const topic of TOPICS) {
    if (topic.word.test(spaced) && !topic.contexts.some((re) => re.test(spaced))) return { crisis: true, category: topic.category };
  }
  return { crisis: false };
}

export function checkCrisis(text: string): CrisisResult {
  for (const spaced of normalize(text)) {
    const result = checkOne(spaced);
    if (result.crisis) return result;
  }
  return { crisis: false };
}

/**
 * The crisis check fired in the chat or on a file she added: the caller shows
 * CRISIS_REPLY, and this texts an urgent alert to her own verified phone and
 * writes both to audit_log (AGENTS.md > Approvals: the one path that skips
 * approvals). Never includes the words that triggered it. Front Desk has its own
 * caller-facing version (lib/frontdesk/crisis.ts) and shares the alert phone.
 */
export async function alertCrisis(input: { source: "chat" | "upload" | "media"; category: CrisisCategory; by: string }): Promise<{ alerted: boolean }> {
  const { audit } = await import("./audit");
  const { alertPhone } = await import("./frontdesk/crisis");
  const { sendText } = await import("./frontdesk/store");
  await audit({ actor: "safety", action: "crisis_detected", subjectType: input.source, details: { category: input.category, by: input.by } });
  const to = await alertPhone().catch(() => null);
  if (!to) {
    await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: input.source, details: { error: "no alert phone (settings.alert_phone or CLINICIAN_ALERT_PHONE)" } });
    return { alerted: false };
  }
  const what =
    input.source === "chat" ? "A message in your chat with Aeon" : input.source === "upload" ? "A file added in your chat with Aeon" : "Something typed on the Media page";
  try {
    await sendText({
      to,
      body: `URGENT from Practice-OS: ${what} mentioned danger or self-harm. Aeon showed the 988/911 message. Please check now.`,
      inquiryId: null,
      actor: "safety",
      action: "crisis_alert_sent",
      force: true,
    });
    return { alerted: true };
  } catch (e) {
    await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: input.source, details: { error: String(e) } });
    return { alerted: false };
  }
}
