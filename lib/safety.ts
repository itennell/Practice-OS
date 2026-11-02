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
    "overdos", "toomanypills", "toomanyofmypills", "hangmyself", "hangherself", "hanghimself",
    "wanttodie", "wantstodie", "wantedtodie", "wantingtodie", "wanttobedead", "wantstobedead",
    "wanttoliveanymore", "wanttobealiveanymore", "wanttobehereanymore",
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
    // Only "disappear into a (good) book" is exempt, and checkOne drops even
    // that when a finality cue ("forever", "nothing matters") is present.
    /\b(want to|wanna) disappear\b(?! into (a )?(good )?books?\b)/,
    // Implicit ending: "I want to end it", "going to end it, hotline?". No end
    // anchor; only a few plainly benign completions pass ("end it at 5",
    // "end it with the vendor", "end things with him").
    /\b(want to|wanna|going to|gonna|ready to|about to|planning to|plan to|thinking about|thinking of|need to|have to|just) end(ing)? (it|everything|things)( all)?\b(?! (at|by|early|earlier|with|after|before|on time|there|here|for the day|for today|off|up)\b)/,
    /\bend(ing)? (it|everything) (tonight|today|right now|for good)\b/,
    // Overdose without the word: "took a bunch of pills", "took too many of my pills".
    /\b(took|taken|swallowed|downed)( (a (bunch|lot|handful|ton|bottle) of|too many( of)?|all( of)?|every one of|(the|a) whole bottle of))( (my|the|those|these|her|his))?( \w+)? (pills|tablets|meds|medication|medications)\b/,
    /\b(take|taking|swallow|swallowing) (a (bunch|lot|handful|ton|bottle) of|too many( of)?|every one of|(the|a) whole bottle of)( (my|the|those|these|her|his))?( \w+)? (pills|tablets|meds|medication)\b/,
    /\b(take|taking|swallow|swallowing) all( of)?( (my|the|those|these))?( \w+)? (pills|tablets|meds|medication)( \w+)?( \w+)? (at once|tonight|together|right now)\b/,
    /\b(pills|tablets|meds) (i|she|he) (took|swallowed|had) (were|was) too many\b/,
    // Can't go on: no end anchor; a short list of benign completions passes
    // ("can't go on vacation", "can't go on Friday", "cannot keep going with this vendor").
    /\b(cant|cannot|can not) (go on|keep going)\b(?! (on )?(vacation|leave|holiday|a trip|trips|retreat|break|maternity|the call|a call|calls|the portal|the website|the site|the app|the system|the panel|the schedule|the calendar|camera|air|record|stage|instagram|social|live|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this week|next week|with (this|the|that|our) (vendor|portal|plan|ehr|system|company|software|biller|contract|process|tool|tools))\b)/,
  ],
  harm_to_others: [],
  danger: [
    // First-person abuse, violence and weapons stay crisis in any context.
    /\b(i|im|i m|i am|ive|i have|i was|i keep|i get|i got)( being| been| getting)? abused\b/,
    /\babus(es|ed|ing) (me|us)\b/,
    /\b(my|her|his) abus(er|ive)\b/,
    /\b(i am|im|i m|been|being|living with|experiencing|suffering|victim of) (in )?(a )?domestic violence\b/,
    /\b(he|she|they|someone|somebody|my \w+|the (caller|man|guy|woman)) (has|had|got|is holding|was holding|grabbed|pulled|is pointing|pointed|is waving) (a|an|his|her|their) (gun|knife|weapon|rifle|pistol)\b/,
  ],
};

// Practice-task allow-list. Topic words (abuse, domestic violence, weapons,
// "suicide" as a subject, the book exemption above) are crisis unless the
// message is plainly a business task about that topic: reporting rules, a
// policies or resources page, a hotline list, billing codes, an intake
// question, a gun-free sign. Each family has its own narrow contexts, so
// "there's a knife, update my policy page" still routes. The allow-list only
// applies when the message has no personal cue at all (PERSONAL below): a
// first-person victim or ideation phrase, a family member plus a harm word, or
// a finality word. Ideation patterns (SQUASHED, WORDS) always win regardless.
// A missed crisis is far worse than a false alarm: when unsure, it routes.
const REPORTING =
  /\b(report(ing)? (child |elder |suspected )?(abuse|neglect)|(abuse|neglect) report(ing|s)?|reporting (requirements?|rules?|laws?|duties|obligations?)|mandat(ed|ory) report(er|ers|ing)|who do i report|report (it|this|that) to)\b/;
const POLICY_PAGE =
  /\b(polic(y|ies)\b.*\b(page|website|site|section|document|doc|statement|handbook)|(crisis|safety|reporting|prevention) polic(y|ies))\b/;
const RESOURCES = /\b(hotlines?|lifeline|resources? (page|list|section))\b/;
const BILLING = /\b(cpt|icd|risk assessments?|risk screenings?|bill(ing)? for|billing codes?)\b/;
const INTAKE = /\b(intake|screening|questionnaire)\b/;
const TOPICS: Array<{ category: CrisisCategory; word: RegExp; contexts: RegExp[] }> = [
  { category: "danger", word: /\babus(e|ed|ing|ive)\b/, contexts: [REPORTING, POLICY_PAGE, RESOURCES] },
  { category: "danger", word: /\bdomestic violence\b/, contexts: [REPORTING, POLICY_PAGE, RESOURCES, BILLING, INTAKE] },
  {
    category: "danger",
    word: /\b(gun|guns|knife|knives|weapon|weapons|firearm|firearms)\b/,
    contexts: [/\b(guns?|weapons?|firearms?) free\b/, /\bno (guns|weapons|firearms)\b/, /\b(guns?|weapons?|firearms?) polic(y|ies)\b/, INTAKE],
  },
];
// "Suicide" as a subject: only these noun phrases are dropped, and only in a
// practice context. Any other "suicid..." ("I'm suicidal", "suicide") routes.
const SUICIDE_TOPIC =
  /\bsuicid(e|al) (prevention|risk|risks|assessments?|screenings?|polic(y|ies)|protocols?|awareness|hotlines?|lifeline|training|safety plans?|ideation (screening|assessment))\b/g;
const SUICIDE_CONTEXTS = [REPORTING, POLICY_PAGE, RESOURCES, BILLING];

const FINALITY =
  /\b(never come back|nobody would (notice|care|miss me)|no one would (notice|care|miss me)|nothing matters|forever|no point|nothing helps|cant take it|cannot take it|give up on everything)\b/;
// Personal cues: any one of these switches the allow-list off for the message.
const HARM = "(hit|hits|hitting|hurt|hurts|hurting|abuse|abuses|abused|abusive|afraid|scared|terrified|unsafe|not safe|end it|die|dying|kill|cant go on|cannot go on|can not go on|choke|chokes|choked|beat|beats|beating|threaten|threatens|threatened|violent|violence|gun|knife|weapon)";
const PERSONAL: RegExp[] = [
  // First person + a harm verb or feeling. Topic nouns (abuse, violence, gun)
  // are left out here so "Who do I report child abuse to?" is not personal.
  /\b(i|im|i m|i am|ive|i have|i was|i feel|i keep|i get|i got)( \w+)?( \w+)?( \w+)? (hit|hits|hitting|hurt|hurts|hurting|abused|afraid|scared|terrified|unsafe|not safe|end it|die|dying|kill|cant go on|cannot go on|can not go on|choked|beaten|threatened)\b/,
  /\b(hit|hits|hurt|hurts|abuse|abuses|abused|choke|chokes|choked|beat|beats|kick|kicks|kicked|threaten|threatens|threatened|attack|attacks|attacked|rape|raped) (me|us|my)\b/,
  /\brisk to (myself|me)\b/,
  /\b(im|i m|i am)( \w+)?( \w+)? suicid(e|al) risk\b/,
  new RegExp(`\\bmy (husband|wife|partner|spouse|boyfriend|girlfriend|bf|gf|dad|father|mom|mother|stepdad|stepmom|ex|son|daughter|brother|sister|roommate|boss|uncle|aunt)s?\\b.*\\b${HARM}`),
  FINALITY,
];

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

// Benign idioms removed before matching, unless a finality cue is present: "I wanted to die laughing", "quiero morir de risa", "ending it all at 5pm".
const IDIOMS = [
  /\b(die|died|dying|morir|morirme|mourir|sterben) (laughing|of laughter|de risa|de rire|vor lachen)\b/g,
  /\bend(ing)? it all (at|by) (\w{1,2} ?(am|pm)|\d+|noon|midnight|close|closing|the end of)\b/g,
];

function checkOne(text: string): CrisisResult {
  const spaced = FINALITY.test(text) ? text : IDIOMS.reduce((t, re) => t.replace(re, " "), text);
  const personal = PERSONAL.some((re) => re.test(spaced));
  const squashed = spaced.replace(/ /g, "");
  // 1. Ideation, self-harm and direct danger: always crisis, whatever else is said.
  for (const category of Object.keys(SQUASHED) as CrisisCategory[]) {
    if (SQUASHED[category].some((s) => squashed.includes(s))) return { crisis: true, category };
    if (WORDS[category].some((re) => re.test(spaced))) return { crisis: true, category };
  }
  // The book exemption on "want to disappear" holds only with no personal cue.
  if (personal && /\b(want to|wanna) disappear\b/.test(spaced)) return { crisis: true, category: "self_harm" };
  // 2. "Suicide": its topic phrases are dropped only in a practice context with no personal cue.
  const practice = !personal && SUICIDE_CONTEXTS.some((re) => re.test(spaced));
  const rest = practice ? spaced.replace(SUICIDE_TOPIC, " ") : spaced;
  if (rest.replace(/ /g, "").includes("suicid") || nearMissSuicide(rest)) return { crisis: true, category: "self_harm" };
  // 3. Danger topic words, unless that family's practice context is present and there is no personal cue.
  for (const topic of TOPICS) {
    if (topic.word.test(spaced) && (personal || !topic.contexts.some((re) => re.test(spaced)))) return { crisis: true, category: topic.category };
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
  // Phone alerts are off (lib/features.ts): text no one; the urgent item at the top of Admin is the alert.
  const { PHONE_ALERTS_ENABLED, FRONT_DESK_ENABLED } = await import("./features");
  if (!PHONE_ALERTS_ENABLED && !FRONT_DESK_ENABLED) {
    await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: input.source, details: { error: "phone alerts are off" } });
    return { alerted: false };
  }
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
