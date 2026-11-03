// Nothing of value may be tied to a referral (AGENTS.md: never charge or pay per
// referral; no fees, gifts or anything of value tied to referrals). Plain code,
// default-refuse, used by every letter check (lib/referrals/outreach.ts
// checkLetter: Muse's drafts, her edits, the debrief follow-up, the approval
// executor), the debrief fields and card notes (lib/referrals/contacts.ts).
//
// Three tiers:
// - ALWAYS: a gift, a treat, a store card, a meal or outing paid for, a
//   kickback or any trade wording. Refused wherever it appears.
// - TIED: words that are ordinary facts on their own ("met over lunch", "a free
//   15-minute consult for new clients", "they give a discount for students",
//   "$175 per session") but refused in a sentence that also asks for or
//   mentions referrals ("half off for patients you refer").
// - Across the whole text: a referral ask anywhere plus a reward anywhere
//   ("Refer a client to me. You'll get something nice." / "For each one.
//   Twenty-five dollars.").
// The text is normalized first (NFKC, look-alike letters, no diacritics or
// zero-width characters) and checked as several copies: as written, hyphens
// dropped, hyphens as spaces, spaced-out letters joined ("g i f t"), and leet.

type Rule = [RegExp, string];

const GIFT = "a gift or something free";
const MONEY = "money or payment";
const TRADE = "something in return for referrals";

const MEALS = "coffees?|lunch(?:es)?|dinners?|brunch(?:es)?|breakfasts?|pizzas?|meals?|food|drinks?|beers?|snacks?|treats?|lattes?|donuts|bagels";
const BRANDS = "starbuck'?s?|amazon|dunkin'?s?|target|visa|mastercard|amex|walmart|costco|uber ?eats|doordash|grubhub|apple|itunes|google play|sephora|nordstrom|chipotle|panera";
const TEAM = "(?:your|the) (?:team|staff|office|front desk|practice|nurses|clinic)";

const ALWAYS: Rule[] = [
  // Gifts, treats and cards.
  [/\b(?:gifts?|gfits?|giftcards?|gift cards?|gift certificates?|vouchers?|e ?gift\w*|prepaid cards?|e ?cards?)\b/i, GIFT],
  [/\b(?:goodies|goody|goodie|baskets?|swag|merch|flowers|bouquets?|cookies|cupcakes|pastr(?:y|ies)|chocolates?|wine|champagne|cater\w*|tickets?)\b/i, GIFT],
  [/\bspa (?:days?|packages?|treatments?|cards?|gifts?|visits?|vouchers?|certificates?)\b/i, GIFT],
  [/\b(?:a|small|little|holiday)\s+presents?\b|\bpresents?\s+for\s+(?:you|your|the)\b/i, GIFT],
  [/\b(?:treats?\s+for\s+(?:you|your|the)\b|sweet treats?|treat (?:you|your (?:team|staff|office))\b|my treat)\b/i, GIFT],
  [/\b(?:happy hours?|drinks on)\b/i, GIFT],
  // A store brand only as a card or credit ("their office is next to a Starbucks" is a fact).
  [new RegExp(`\\b(?:${BRANDS}|store|restaurant|coffee(?: shop)?)\\s+(?:e ?)?(?:gift\\s+)?(?:cards?|credits?|certificates?|vouchers?|codes?|gift)\\b`, "i"), GIFT],
  [new RegExp(`(?:\\$\\s?\\d[\\d,.]*|\\b\\d+\\s*(?:dollars?|bucks))\\s+(?:\\w+\\s+){0,1}?(?:${BRANDS})\\b`, "i"), GIFT],
  [/\$\s?\d[\d,.]*\s+on (?:it|the card|them)\b/i, GIFT],
  // "Coffee's on me", "a Cubs game on me", "lunch will be on my practice"; never "count on me".
  [new RegExp(`\\b(?:${MEALS}|round|rounds|tab|bill|check|games?|shows?|concerts?|class(?:es)?|it|this|that|everything|the (?:first|next) (?:one|round))(?:\\s+is|\\s+are|'s|'re|\\s+will be|\\s+would be)?\\s+on\\s+(?:me|us|my practice|our practice|the house)\\b|\\bon the house\\b`, "i"), GIFT],
  [new RegExp(`\\b(?:buy|get|bring|treat)\\s+(?:you|${TEAM})\\s+(?:a\\s+|some\\s+|to\\s+)?(?:${MEALS})\\b`, "i"), GIFT],
  [new RegExp(`\\b(?:drop off|bring|send|buy|get|order)\\s+(?:a |an |some )?(?:${MEALS})\\s+(?:for|to)\\b`, "i"), GIFT],
  [new RegExp(`\\b(?:${MEALS})\\b[^.!?\\n]{0,25}\\bfor ${TEAM}\\b|\\b(?:${MEALS}) (?:friday|day|party)\\b`, "i"), GIFT],
  [/\b(?:I|we)(?:'ll|'d| will| would| can| could)?\s+(?:[\w']+\s+){0,3}?(?:take (?:you|your \w+)(?: all)? out\b(?!\s+of\b)|take (?:good )?care of you\b(?!r))/i, GIFT],
  [/\bpick up the (?:check|tab|bill)\b|\b(?:get|buy|grab) the (?:next |first )?round\b|\b(?:my|our) shout\b|\b(?:it'?s|is) my round\b/i, GIFT],
  [/\b(?:something (?:nice|special|fun)|(?:a )?little something|worth your while)\b/i, GIFT],
  [/\b(?:venmo|paypal|zelle|cash ?app)\s+(?:you|your\b)|\b(?:send|pay|give)\s+(?:you|your \w+)\b[^.!?\n]{0,25}?\b(?:on|via|through|by|with)\s+(?:venmo|paypal|zelle|cash ?app)\b/i, MONEY],
  [/\b(?:I|we)(?:'ll| will| can| could| would|'d)?\s+(?:happily |gladly |also )?(?:cover|pay for)\s+(?:[\w']+\s+){0,3}?(?:ceus?|ce credits?|ce hours?|costs?|fees?|expenses?|tab|bill|copays?|parking|tuition|trainings?)\b/i, GIFT],
  [/\b(?:cover|pay for|reimburs\w*|fund)\b[^.!?\n]{0,30}\b(?:ceus?|ce credits?|ce hours?|continuing education|trainings?|tuition|conference fees?)\b/i, GIFT],
  [/\b(?:fruit (?:arrangements?|baskets?)|edible arrangements?)\b/i, GIFT],
  // "I'll comp the first visit"; never workers' comp.
  [/(?<!\bworkers'?\s)\bcomp(?:s|ed|ing)?\b(?!\s+(?:time|insurance|claims?))/i, GIFT],
  [/\b(?:you|your (?:office|team|staff|practice|front desk))\s+(?:will |'ll |would |can |could )?(?:get|gets|receive|receives|earn|earns)\b[^.!?\n]{0,30}?(?:\$\s?\d|\b\d+\s*(?:dollars?|bucks)\b|\b(?:dollars?|bucks|cash|credit|gift|reward|bonus|something)\b)/i, MONEY],
  // Dollars or bucks per patient, each or every: always a price on a referral ("$175 per session" is written with $).
  [/\b(?:dollars?|bucks)\b[^.!?\n]{0,30}\b(?:per|each|every|apiece|a head)\b|\b(?:per|each|every)\b[^.!?\n]{0,30}\b(?:dollars?|bucks)\b/i, MONEY],
  // Money for referrals and trade words.
  [/\b(?:pay|paid|paying)\s+(?:you|your)\b|\bget(?:s|ting)?\s+paid\b|\bpaid\s+for\s+(?:a\s+|each\s+|every\s+|your\s+)?referrals?\b|\b(?:referral|finder'?s)\s+fees?\b/i, MONEY],
  [/\b(?:compensat\w*|commissions?|kick ?backs?|rebates?|coupons?|honorari(?:um|a|ums)|gratuit(?:y|ies)|stipends?|remunerat\w*|revenue shar\w*|split the fee)\b/i, MONEY],
  [/\b(?:give|send|hand|offer)\s+(?:you|your (?:team|staff|office))\s+(?:a\s+)?(?:\$\s?\d|\d+\s*(?:dollars?|bucks)|cash|credit)/i, MONEY],
  [/(?:\$\s?\d[\d,.]*|\b\d+\s*(?:dollars?|bucks))\s*(?:\w+\s+){0,2}?(?:credit(?!\s*cards?)|cash|back|gift|reward|bonus|off)\b/i, MONEY],
  [/\b(?:per referral|for each referral|for every referral|for any referral|in exchange for|in return|in appreciation|reward\w*|incentive\w*|bonus\w*|perks?)\b/i, TRADE],
  [/\b(?:for|per|after|with) (?:every|each)\s+(?:\d+|two|three|four|five|six|ten)\s+(?:referrals?|patients?|clients?)\b/i, TRADE],
  [/\b(?:reciprocat\w*|swap\w*|quid pro quo|scratch (?:my|your) back)\b|\bI(?:'ll| will)? refer\b[^.!?\n]{0,40}\byou(?:'ll| will)? refer\b|\byou(?:'ll| will)? refer\b[^.!?\n]{0,40}\bI(?:'ll| will)? refer\b/i, TRADE],
  [/\bas (?:a|my|our) (?:small |little |big )?thank ?you\b|\btokens? of (?:my |our )?(?:appreciation|thanks|gratitude)\b|\bthank ?you (?:gift|basket|lunch|treat|present)s?\b/i, TRADE],
  // "A thank-you for your referrals", "a little thank you": a thank-you as a thing; never "Thank you for any referrals" or a thank-you note.
  [/\b(?:a|little|small|my|our)\s+thank ?you\b(?!\s+(?:note|letter|email|e-?mail|card|message|call)\b|\s+for\s+(?:meeting|your time|talking|the call|speaking|taking the time|the chat|the conversation|the visit|having me|the tour|your help|everything you do)\b)/i, TRADE],
  [/\bin thanks\b|\bas thanks\b|\bmy thanks will be\b/i, TRADE],
  // A share of her fees.
  [/(?:\b\d+(?:\.\d+)?\s*(?:%|percent\b|per\s+cent\b)|\b(?:cut|share|portion|percentage)\s+of\b)[^.!?\n]{0,40}\b(?:fees?|revenue|income|billing|referr\w*|each\s+client)\b/i, "a share of fees"],
  // Spanish, Polish, Portuguese, French and German offers.
  [/\bd[oó]lares\b|\bpor\s+cada\s+(?:referid|paciente|cliente)\w*|\bcomisi[oó]n\b|\bregalos?\b|\bgratis\b|\btarjeta de regalo\b|\b(?:te|le|les|los|las)\s+invito\s+a\b|\binvitar(?:te|le|les)\s+a\s+(?:comer|cenar|almorzar|desayunar|un cafe)\b/i, MONEY],
  [/\bprezent\w*|\bprowizj\w*|\bznizk\w*|\bpodarun\w*|\bza\s+(?:kazde\s+|kazdego\s+)?polecen\w*/i, MONEY],
  [/\bpresentes?\b|\bcartao presente\b|\bcomissao\b|\bpor cada (?:indicac|encaminhament)\w*|\bcadeau\w*|\bcarte cadeau\b|\bpar (?:patient|client|recommandation)\b|\bpour chaque (?:patient|client)\b|\bgeschenk\w*|\bgutschein\w*|\bprovision\b|\bpro (?:patient|empfehlung|uberweisung)\b|\bfur jeden (?:patienten|klienten)\b/i, MONEY],
];

/** A referral ask or mention: "refer", "you send", "for each one", "per patient", "anyone you send". */
const TIE =
  /\brefer\w*|\b(?:you|they|your (?:team|office|staff|practice))\s+(?:send|sends|sent|pass|passes|direct)\b|\bsend\w*\s+(?:\w+\s+){0,3}?(?:my way|over|to me|along)\b|\bmy way\b|\b(?:for|per)\s+(?:each|every)\s+(?:new\s+)?(?:one|patient|client|person|family|referral)s?\b|\b(?:per|for each|for every)\s+(?:new\s+)?(?:patient|client|person|referral)s?\b|\byour (?:patients?|clients?)\b|\b(?:anyone|anybody|whoever)\s+(?:you|they)\s+(?:send|refer)\w*/i;

/** A referral ask that makes even a short free consult a trade: "per", "each", "if you refer", "anyone you send". */
const STRONG_TIE = /\b(?:per|each|every)\b|\b(?:if|when|once|whenever)\s+(?:you|they)\s+(?:refer|send)|\b(?:anyone|anybody|whoever)\s+(?:you|they)\b|\brefer\w*/i;
/** Her normal intake: a short free call or consult ("a free 15-minute call", "a free intro consult"). */
const FREE_INTAKE = /\bfree\s+(?:\d+\s*-?\s*minutes?\s+|fifteen-?minute\s+|twenty-?minute\s+|short\s+)?(?:phone\s+|intro(?:ductory)?\s+|video\s+)?(?:calls?|consult\w*|chats?)\b/gi;

const FREE = /(?<!\bfeel\s)\bfree\b(?!\s+to\b)|\b(?:complimentary|no charge|no cost|at no cost)\b/i;

/** Ordinary on their own (her fees, a partner's offers, a meal she had); refused in a sentence with a referral ask. */
const TIED: Rule[] = [
  [FREE, "something free in return for referrals"],
  [/\$\s?0(?:\.0+)?(?![\d.,]*[1-9])|\bzero (?:dollars|cost|charge)\b|\bfor nothing\b/i, "something free in return for referrals"],
  [/\b(?:coffees?|lunch(?:es)?|dinners?|brunch(?:es)?|breakfasts?|pizzas?|drinks|beers?|lattes?|donuts|bagels)\b/i, GIFT],
  [/\b(?:venmo|paypal|cash ?app|zelle)\b/i, MONEY],
  [/\b(?:discount\w*|priorit\w*|\d+\s*(?:%|percent)\s*off|half off|\w+ off (?:the|your|their)|reduced (?:rates?|fees?|prices?)|waiv\w*|credits?(?!\s*cards?)|cash|donat\w*|sponsor\w*)\b/i, TRADE],
];

/** A reward anywhere in a text that also asks for referrals anywhere. */
const REWARD = /\b(?:you(?:'ll| will)? (?:get|receive|earn) (?:a |some |something)|credits?(?!\s*cards?)|cash|bucks|dollars?)\b/i;

const MONEY_SAID = /\$\s?\d|\b\d+\s*(?:dollars?|bucks|usd)\b|\b(?:dollars?|bucks)\b/i;
/** A dollar amount that is her fee or a plan's cost, never a reward. */
const FEE_WORDS =
  /\b(?:fees?|rates?|sessions?|hours?|hourly|visits?|intakes?|evaluations?|assessments?|minutes?|\d+ ?minutes?|superbills?|copays?|co-?pays?|coinsurance|deductibles?|out of network|outofnetwork|sliding|private ?pay|self ?pay|costs?|charges?|charged|prices?|priced|per session)\b/i;

const sentencesOf = (t: string) => t.split(/(?<=[.!?;])\s+|\n+/).filter((s) => s.trim());

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "@": "a", $: "s" };
/** Look-alike letters NFKC leaves alone (Latin, Cyrillic, Greek, Cherokee). */
const CONFUSABLES: Record<string, string> = {
  "ɡ": "g", "Ꮐ": "G", "ɑ": "a", "ı": "i", "а": "a", "е": "e", "о": "o", "р": "p", "с": "c",
  "у": "y", "х": "x", "і": "i", "ј": "j", "ԁ": "d", "А": "A", "Е": "E", "О": "O", "Р": "P",
  "С": "C", "Т": "T", "К": "K", "М": "M", "Н": "H", "В": "B", "ο": "o", "α": "a", "ν": "v",
  "ρ": "p", "ι": "i", "Ο": "O", "Α": "A", "Β": "B", "Ε": "E", "Κ": "K", "Ι": "I", "Ꭰ": "D",
  "Ꭱ": "R", "Ꭲ": "T", "Ꭺ": "G", "Ꮃ": "W", "Ꮇ": "M", "Ꮋ": "H", "Ꮒ": "h", "Ꮓ": "Z", "Ꮟ": "b",
  "Ꮩ": "V", "Ꮪ": "S", "Ꮮ": "L", "Ꮯ": "C", "Ꮲ": "P", "Ꮶ": "K", "Ꮷ": "d",
};

/**
 * The copies of a text every rule runs on: normalized; hyphens inside words dropped ("kick-back");
 * hyphens as spaces ("no-cost", "on-the-house"); spaced-out letters joined ("g i f t"); and
 * leet-speak read as letters ("g1ft"; "$175" stays money).
 */
export function valueVariants(text: string): string[] {
  const base = text
    .normalize("NFKC")
    .replace(/[\u0251\u0261\u0131\u0370-\u03FF\u0400-\u052F\u13A0-\u13FF]/g, (c) => CONFUSABLES[c] ?? c)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD]/g, "")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u2010\u2011]/g, "-");
  const joined = base.replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, "");
  const spaced = base.replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, " ");
  // Three or more single letters in a row ("g i f t", "g.i.f.t"): read as one word.
  const letters = spaced.replace(/\b\p{L}(?:[\s.]+\p{L}\b){2,}/gu, (m) => m.replace(/[\s.]+/g, ""));
  const leet = joined.replace(/[01345@$]/g, (c, i: number, s: string) => (/\p{L}/u.test(s[i - 1] ?? "") || /\p{L}/u.test(s[i + 1] ?? "") ? (LEET[c] ?? c) : c));
  return [...new Set([base, joined, spaced, letters, leet])];
}

/** "Reimburse" is a plan paying her ("BCBS reimburses well"), or her paying them: only the first may be said. */
const REIMBURSE = /\breimburs\w*/i;
const PLAN_WORDS = /\b(?:insur\w*|plans?|payers?|medicare|medicaid|bcbs\w*|blue cross|aetna|cigna|united\w*|optum|tricare|humana|network|claims?|rates?|superbills?|out of network|benefits?)\b/i;
/** "Coffee's on Reyes Counseling" / "on Dr. Lee": a meal on a person or a practice. */
const ON_WHO =
  /\b(?:[Cc]offee|[Ll]unch|[Dd]inner|[Bb]runch|[Bb]reakfast|[Pp]izza|[Dd]rinks?|[Mm]eals?|[Ff]ood|[Tt]reats?|[Rr]ounds?|[Tt]he (?:tab|bill|check))(?:'s|\s+is|\s+are|\s+will be)\s+on\s+((?:Dr\.?\s+)?[A-Z][\w']*(?:\s+[A-Z][\w']*){0,3})/g;
const STREET = /^(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|place|pl|parkway|pkwy|court|ct|square|sq|plaza|highway|hwy|terrace|circle|row|floor)\.?$/i;
const PRACTICE_WORD = /^(?:counseling|counselling|therapy|therapies|psychotherapy|wellness|health|group|associates|practice|pllc|llc|pc|clinic|center|centre)$/i;
const NOT_A_NAME = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Zoom|Teams|Google|Epic|Halsted|Clark|Lincoln|Michigan|State|Main)/;

/** True when a meal is "on" a person ("Dr. Lee", "Dana Reyes") or a practice ("Reyes Counseling"), never a street, a day or a company. */
function mealOnSomeone(text: string): boolean {
  for (const m of text.matchAll(ON_WHO)) {
    const who = m[1];
    const words = who.split(/\s+/);
    const last = words[words.length - 1];
    if (/^Dr\.?$/.test(words[0])) return true;
    if (/'s$/.test(words[0]) || words.length === 1) continue;
    if (STREET.test(last)) continue;
    if (words.some((w) => PRACTICE_WORD.test(w))) return true;
    if (NOT_A_NAME.test(words[0])) continue;
    // Two capitalized words that aren't a street: a person's name.
    return true;
  }
  return false;
}
const MET_OVER =
  /\b(?:met|meet|meeting|chatted|talked|caught up|sat down)(?: up)?(?: with [\w. ]{1,40}?)? (?:for|over) (?:a |an )?(?:quick |short )?(?:coffee|lunch|breakfast|brunch|dinner)\b|\bover (?:a |an )?(?:quick )?(?:coffee|lunch|breakfast|brunch|dinner)\b/gi;
const NEAR_TEAM = /\byour (?:team|staff|office|front desk|practice|nurses|clinic)\b/i;

function offeredIn(text: string): string | null {
  for (const [pattern, what] of ALWAYS) if (pattern.test(text)) return what;
  if (mealOnSomeone(text)) return GIFT;
  const sentences = sentencesOf(text);
  if (sentences.some((s) => REIMBURSE.test(s) && !PLAN_WORDS.test(s))) return MONEY;
  let reward = REWARD.test(text);
  for (const raw of sentences) {
    // Her normal short free consult is no offer, unless the sentence ties it to referrals or a reward.
    const plain = STRONG_TIE.test(raw) || REWARD.test(raw) ? raw : raw.replace(FREE_INTAKE, "intake call");
    // A meal they met over is a fact ("we met for coffee and she said they refer often").
    const s = plain.replace(MET_OVER, "met");
    // Free for their team or office ("a free talk for your team") is a gift to the referrer.
    if (FREE.test(s) && NEAR_TEAM.test(s)) return GIFT;
    const tied = TIE.test(s);
    const money = MONEY_SAID.test(s) && !FEE_WORDS.test(s);
    if (money) reward = true;
    if (!tied) continue;
    if (money) return "a dollar amount";
    for (const [pattern, what] of TIED) if (pattern.test(s)) return what;
  }
  return reward && TIE.test(text) ? TRADE : null;
}

// ---- Notes, partner facts and debrief fields ------------------------------------------------
// These describe the partner ("they offer free parking", "met over lunch"), so a value word alone
// is a fact. Refused: plain trade wording anywhere, or a sentence that ties something of value to
// referrals ("a $25 gift card for every client I take", "free sessions if they send people over").

/** Trade wording that is never a fact about an office. */
const EXPLICIT_TRADE: Rule[] = [
  [/\b(?:per referral|for (?:each|every|any) referral|referral fees?|finder'?s fees?|kick ?backs?|in exchange for|quid pro quo|split the fee|revenue shar\w*|referral swap|swap referrals|paid (?:for|per) (?:a |each |every |your )?referrals?|pay(?:s|ing)? (?:you|them|her|me) for referrals?)\b/i, TRADE],
  ...ALWAYS.filter(([, what]) => what === "a share of fees"),
  // Spanish, Polish, Portuguese, French and German offers.
  ...ALWAYS.slice(-3),
];
/** Something of value tied to referrals in the same sentence, whoever offers it. */
const PARTNER_TIE =
  /\b(?:per|for each|for every|each|every)\s+(?:new\s+)?(?:patient|client|referral|person|family|families|one|people|kid|child)s?\b|\bfor (?:the |your |our |my |their |any |all |those )?referrals?\b|\b(?:if|when|once|whenever|each time|every time)\s+(?:you|they|I|we|she|he|her office|their office)\s+(?:send|refer)\w*|\bin return\b|\bfor sending\b|\bsend\w* (?:\w+ )?(?:people|patients|clients) (?:over|my way|our way|to (?:me|us|her|them))\b|\b(?:anyone|anybody|whoever)\s+(?:you|they|I|we)\s+(?:send|refer)\w*/i;

function partnerOfferedIn(text: string): string | null {
  for (const [pattern, what] of EXPLICIT_TRADE) if (pattern.test(text)) return what;
  for (const s of sentencesOf(text)) {
    if (!PARTNER_TIE.test(s)) continue;
    const what = offeredIn(s);
    if (what) return what;
  }
  return null;
}

export type Speaker = "her" | "partner";

/**
 * What a text offers or mentions of value tied to referrals (a gift, a treat, money, a trade
 * for "each patient you send"), or null. Plain code, default-refuse.
 * - speaker "her" (the default): her letters and her own offers, the strict rules.
 * - speaker "partner": notes, partner facts and debrief fields, which describe the office;
 *   only trade wording or value tied to referrals in a sentence is refused.
 */
export function valueOffered(text: string, opts: { speaker?: Speaker } = {}): string | null {
  const check = opts.speaker === "partner" ? partnerOfferedIn : offeredIn;
  for (const v of valueVariants(text)) {
    const what = check(v);
    if (what) return what;
  }
  return null;
}
