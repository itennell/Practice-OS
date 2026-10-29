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
  self_harm: [/\bjump(ing)? off (the|a) (bridge|building|roof|cliff)\b/],
  harm_to_others: [],
  danger: [/\b(gun|knife|weapon)\b/, /\bdomestic violence\b/, /\babus(e|ed|ing|ive)\b/],
};

// Misspellings of the two words that matter most ("suicdal", "suacidal", "sucidal").
const FUZZY_TARGETS = ["suicide", "suicidal"];

function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

export function checkCrisis(text: string): CrisisResult {
  const spaced = normalize(text);
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
