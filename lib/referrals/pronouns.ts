// Providers on her Referrals board come from a public registry that says nothing
// about gender, so Aeon calls each one by name or "they" (a Nov 2 re-test found
// "Dr. Johnson ... he'll"). The model is told so; plain code makes sure: in any
// paragraph of a reply that names a provider, he/she forms after the name become
// they/them/their. Aeon talks to the clinician as "you", so a third-person
// pronoun there is about the provider.

/** The family name a reply would use for a card name: "[Sample] Maria Johnson, MD" -> "Johnson". */
export function familyName(name: string): string | null {
  const person = name.replace(/\[sample\]/gi, "").split(",")[0].replace(/\b(?:dr|mr|ms|mrs)\.?\s+/gi, "").trim();
  const words = person.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'-]+$/.test(w));
  const last = words.at(-1);
  return last && last.length >= 2 ? last : null;
}

const cap = (word: string, like: string) => (/^[A-Z]/.test(like) ? word[0].toUpperCase() + word.slice(1) : word);

const ADVERB = "(?:also|often|usually|now|still|only|already|just|really|mostly|mainly|typically|generally|currently)";
const IRREGULAR: Record<string, string> = {
  is: "are", was: "were", has: "have", does: "do", "doesn't": "don't", "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't", goes: "go",
};
// Third-person verbs that don't end in -s on purpose and words that look like verbs but aren't.
const NOT_VERBS = new Set(["always", "perhaps", "sometimes", "less", "unless", "as", "us", "was", "this", "thus", "plus", "across", "its", "yes"]);

function plural(verb: string): string {
  const lower = verb.toLowerCase();
  if (IRREGULAR[lower]) return cap(IRREGULAR[lower], verb);
  if (NOT_VERBS.has(lower) || lower.length < 3 || !lower.endsWith("s") || lower.endsWith("ss")) return verb;
  if (/ies$/.test(lower)) return verb.slice(0, -3) + "y";
  if (/(?:sses|shes|ches|xes|zes|oes)$/.test(lower)) return verb.slice(0, -2);
  return verb.slice(0, -1);
}

// After "her", these words mean "her" was the object ("call her back", "give her a flyer"); any other word is what's theirs ("her office").
const OBJECT_NEXT =
  /^(?:and|or|but|back|know|up|about|to|for|if|when|that|again|today|tomorrow|soon|directly|first|next|too|a|an|the|this|these|those|some|your|my|our|it|in|at|on|with|by|from|now|later|so|as|yet|how|what|why|who|whether|once|before|after|since|until|while|there|here)$/i;

/** One paragraph, from the first time it names a provider. */
function neutralize(text: string): string {
  let out = text
    .replace(/\b(he|she)(['’])(s|ll|d|ve)\b/gi, (m, p: string, q: string, tail: string) => cap(`they${q}${tail.toLowerCase() === "s" ? "re" : tail}`, p))
    .replace(/\b(himself|herself)\b/gi, (m) => cap("themselves", m))
    .replace(/\bhers\b/gi, (m) => cap("theirs", m))
    .replace(/\bhis\b/gi, (m) => cap("their", m))
    .replace(/\bhim\b/gi, (m) => cap("them", m));
  out = out.replace(new RegExp(`\\b(he|she)\\b(\\s+${ADVERB})?(\\s+)([A-Za-z']+)`, "gi"), (m, p: string, adv: string | undefined, sp: string, verb: string) =>
    `${cap("they", p)}${adv ?? ""}${sp}${plural(verb)}`,
  );
  out = out.replace(/\b(he|she)\b/gi, (m) => cap("they", m));
  // "her": "their" before a word ("her office"), "them" after a verb or preposition or at the end ("call her").
  out = out.replace(/\bher\b(\s*)([A-Za-z]*)/gi, (m, sp: string, next: string) => {
    const asObject = !next || OBJECT_NEXT.test(next);
    return `${cap(asObject ? "them" : "their", m)}${sp}${next}`;
  });
  return out;
}

/** The reply with he/she about the named providers replaced by they/them/their. Names are card names from this turn's tools. */
export function neutralPronouns(reply: string, cardNames: string[]): string {
  const families = [...new Set(cardNames.map(familyName).filter((x): x is string => Boolean(x)))];
  if (!families.length) return reply;
  const named = new RegExp(`\\b(?:${families.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`);
  return reply
    .split("\n")
    .map((para) => {
      const at = para.search(named);
      if (at < 0) return para;
      return para.slice(0, at) + neutralize(para.slice(at));
    })
    .join("\n");
}

/** Card names a referral tool's result mentions ("name": ..., "to": ...). */
export function cardNamesIn(toolText: string): string[] {
  return [...toolText.matchAll(/"(?:name|to)":\s*"([^"]{3,160})"/g)].map((m) => m[1]);
}
