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
// "kill my self", "k i l l myself" and "self-harm" all match.
const SQUASHED: Record<CrisisCategory, string[]> = {
  self_harm: [
    "suicid",
    "killmyself", "killherself", "killhimself", "killthemselves",
    "selfharm", "selfinjur",
    "hurtmyself", "hurtherself", "hurthimself", "cutmyself", "cuttingmyself", "cuttingherself",
    "endmylife", "endmyownlife", "endherlife", "endhislife", "endtheirlife", "enditall",
    "takemylife", "takemyownlife", "takeherlife", "takehislife",
    "overdose", "toomanypills", "hangmyself", "hangherself", "hanghimself",
    "wanttodie", "wantstodie", "wanttobedead", "wantstobedead",
    "betteroffdead", "betteroffwithoutme", "noreasontolive",
    "dontwanttobehereanymore", "dontwanttoliveanymore", "dontwanttolive", "dontwanttowakeup",
    "cantgoonliving", "wantittobeover",
  ],
  harm_to_others: [
    "killhim", "killher", "killthem", "killyou", "killsomeone", "killeveryone", "killme",
    "hurtsomeone", "hurtme", "hurtmykids", "hurtthekids", "hurtmychild",
    "shoothim", "shoother", "shootthem", "shootsomeone", "shootmyself",
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
    /\b(want to|wanna) disappear\b/,
  ],
  harm_to_others: [],
  danger: [/\b(gun|knife|weapon)\b/, /\bdomestic violence\b/, /\babus(e|ed|ing|ive)\b/],
};

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
  const folded = fold(text);
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

function checkOne(spaced: string): CrisisResult {
  const squashed = spaced.replace(/ /g, "");
  for (const category of Object.keys(SQUASHED) as CrisisCategory[]) {
    if (SQUASHED[category].some((s) => squashed.includes(s))) return { crisis: true, category };
    if (WORDS[category].some((re) => re.test(spaced))) return { crisis: true, category };
  }
  const nearMiss = spaced
    .split(" ")
    .some((word) => word.length >= 6 && word.startsWith("s") && FUZZY_TARGETS.some((t) => editDistance(word, t) <= 1));
  if (nearMiss) return { crisis: true, category: "self_harm" };
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
