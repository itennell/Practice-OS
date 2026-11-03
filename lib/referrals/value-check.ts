// Nothing of value may be tied to a referral (AGENTS.md: never charge or pay per
// referral; no fees, gifts or anything of value tied to referrals). Plain code,
// default-refuse, used by every letter check (lib/referrals/outreach.ts
// checkLetter: Muse's drafts, her edits, the debrief follow-up, the approval
// executor), the debrief fields and card notes (lib/referrals/contacts.ts).
//
// Three tiers:
// - ALWAYS: a gift, a treat, a store card, a meal or outing paid for, a
//   kickback or any trade wording. Refused wherever it appears.
// - TIED: value words that are ordinary practice facts on their own ("a free
//   15-minute consult for new clients", "they give a discount for students",
//   "$175 per session") but refused in a sentence that also asks for or
//   mentions referrals ("half off for patients you refer").
// - Across the whole text: a referral ask anywhere plus a reward anywhere
//   ("Refer a client to me. You'll get something nice." / "For each one.
//   Twenty-five dollars.").
// The text is normalized first (NFKC, no diacritics or zero-width characters,
// hyphens inside words dropped, and a leet-speak copy), and every copy is checked.

type Rule = [RegExp, string];

const GIFT = "a gift or something free";
const MONEY = "money or payment";
const TRADE = "something in return for referrals";

const ALWAYS: Rule[] = [
  // Gifts, treats and cards.
  [/\b(?:gifts?|gfits?|giftcards?|gift cards?|gift certificates?|vouchers?|e ?gift\w*|prepaid cards?)\b/i, GIFT],
  [/\b(?:goodies|goody|goodie|baskets?|swag|merch|flowers|bouquets?|cookies|cupcakes|pastr(?:y|ies)|bagels|donuts|doughnuts|chocolates?|wine|champagne|cater\w*|tickets?|spa)\b/i, GIFT],
  [/\b(?:a|small|little|holiday|thank ?you)\s+presents?\b|\bpresents?\s+for\s+(?:you|your|the)\b/i, GIFT],
  [/\b(?:treats?\s+for\s+(?:you|your|the)\b|sweet treats?|treat (?:you|your (?:team|staff|office))\b|my treat)\b/i, GIFT],
  [/\b(?:lunch|dinner|brunch|breakfast|pizza|happy hours?|drinks on)\b/i, GIFT],
  [/\b(?:starbucks|amazon|dunkin'?|uber ?eats|doordash|grubhub|venmo|paypal|cash ?app|zelle)\b/i, GIFT],
  [/\b(?:visa|mastercard|target|store|restaurant|coffee)\s+(?:gift\s+)?cards?\b/i, GIFT],
  // "Coffee's on me", "a Cubs game on me", "the first round is on us"; never "count on me".
  [/\b(?:coffee|lunch|drinks?|dinner|brunch|breakfast|pizza|meals?|food|treats?|round|rounds|tab|bill|games?|shows?|concerts?|beers?|it|this|that|everything|the (?:first|next) (?:one|round))(?:\s+is|\s+are|'s|'re)?\s+on\s+(?:me|us|my practice|our practice|the house)\b|\bon the house\b/i, GIFT],
  [/\b(?:buy|get|bring|treat)\s+(?:you|your (?:team|staff|office|front desk)|the (?:team|staff|office))\s+(?:a\s+|some\s+|to\s+)?(?:coffee|lunch|dinner|brunch|drinks?|breakfast|pizza|meals?|treats?|snacks?)\b/i, GIFT],
  [/\b(?:something (?:nice|special)|(?:a )?little something|worth your while)\b/i, GIFT],
  [/\b(?:I|we)(?:'ll| will| can| could| would|'d)?\s+(?:happily |gladly |also )?(?:cover|pay for)\s+(?:[\w']+\s+){0,3}?(?:ceus?|ce credits?|ce hours?|costs?|fees?|expenses?|tab|bill|copays?|parking|tuition|trainings?)\b/i, GIFT],
  [/\b(?:cover|pay for|reimburs\w*|fund)\b[^.!?\n]{0,30}\b(?:ceus?|ce credits?|ce hours?|continuing education|trainings?|tuition|conference fees?)\b/i, GIFT],
  [/\b(?:fruit (?:arrangements?|baskets?)|edible arrangements?)\b/i, GIFT],
  [/\b(?:drop off|bring|send|buy|get)\s+(?:a |an |some )?(?:coffees?|lattes?|snacks?|treats?|food|meals?|drinks?|donuts|bagels)\s+(?:for|to)\b/i, GIFT],
  [/\b(?:you|your (?:office|team|staff|practice|front desk))\s+(?:will |'ll |would |can |could )?(?:get|gets|receive|receives|earn|earns)\b[^.!?\n]{0,30}?(?:\$\s?\d|\b\d+\s*(?:dollars?|bucks)\b|\b(?:dollars?|bucks|cash|credit|gift|reward|bonus|something)\b)/i, MONEY],
  // Money for referrals and trade words.
  [/\b(?:pay|paid|paying)\s+(?:you|your)\b|\bget(?:s|ting)?\s+paid\b|\bpaid\s+for\s+(?:a\s+|each\s+|every\s+|your\s+)?referrals?\b|\b(?:referral|finder'?s)\s+fees?\b/i, MONEY],
  [/\b(?:compensat\w*|commissions?|kick ?backs?|rebates?|coupons?|honorari(?:um|a|ums)|gratuit(?:y|ies)|stipends?|remunerat\w*|revenue shar\w*|split the fee)\b/i, MONEY],
  [/\b(?:give|send|hand|offer)\s+(?:you|your (?:team|staff|office))\s+(?:a\s+)?(?:\$\s?\d|\d+\s*(?:dollars?|bucks)|cash|credit)/i, MONEY],
  [/(?:\$\s?\d[\d,.]*|\b\d+\s*(?:dollars?|bucks))\s*(?:\w+\s+){0,2}?(?:credit(?!\s*cards?)|cash|back|gift|reward|bonus|off)\b/i, MONEY],
  [/\b(?:per referral|for each referral|for every referral|for any referral|in exchange for|in return|in appreciation|reward\w*|incentive\w*|bonus\w*|perks?)\b/i, TRADE],
  [/\b(?:reciprocat\w*|swap\w*|quid pro quo|scratch (?:my|your) back)\b|\bI(?:'ll| will)? refer\b[^.!?\n]{0,40}\byou(?:'ll| will)? refer\b|\byou(?:'ll| will)? refer\b[^.!?\n]{0,40}\bI(?:'ll| will)? refer\b/i, TRADE],
  [/\bas (?:a|my|our) (?:small |little |big )?thank ?you\b|\btokens? of (?:my|our) (?:appreciation|thanks|gratitude)\b|\bthank ?you (?:gift|basket|lunch|treat|present)s?\b/i, TRADE],
  // A share of her fees.
  [/(?:\b\d+(?:\.\d+)?\s*(?:%|percent\b|per\s+cent\b)|\b(?:cut|share|portion|percentage)\s+of\b)[^.!?\n]{0,40}\b(?:fees?|revenue|income|billing|referr\w*|each\s+client)\b/i, "a share of fees"],
  // Spanish and Polish offers.
  [/\bd[oó]lares\b|\bpor\s+cada\s+(?:referid|paciente|cliente)\w*|\bcomisi[oó]n\b|\bregalos?\b|\bgratis\b|\btarjeta de regalo\b/i, MONEY],
  [/\bprezent\w*|\bprowizj\w*|\bznizk\w*|\bpodarun\w*|\bza\s+(?:kazde\s+|kazdego\s+)?polecen\w*/i, MONEY],
];

/** A referral ask or mention: "refer", "you send", "for each one", "anyone you send". */
const TIE =
  /\brefer\w*|\b(?:you|they|your (?:team|office|staff|practice))\s+(?:send|sends|sent|pass|passes|direct)\b|\bsend\w*\s+(?:\w+\s+){0,3}?(?:my way|over|to me|along)\b|\bmy way\b|\b(?:for|per)\s+(?:each|every)\s+(?:new\s+)?(?:one|patient|client|person|family|referral)s?\b|\byour (?:patients?|clients?)\b|\b(?:anyone|anybody|whoever)\s+(?:you|they)\s+(?:send|refer)\w*/i;

/** Ordinary on their own (her fees, a partner's offers); refused in a sentence with a referral ask. */
const TIED: Rule[] = [
  // "Feel free to send them my way" is an invitation, not an offer.
  [/(?<!\bfeel\s)\bfree\b(?!\s+to\b)|\b(?:complimentary|no charge|no cost)\b/i, "something free in return for referrals"],
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

/** The copies of a text every rule runs on: normalized, hyphens inside words dropped, and leet-speak read as letters. */
export function valueVariants(text: string): string[] {
  const base = text
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD]/g, "")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u2010\u2011]/g, "-");
  const joined = base.replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, "");
  // A digit or symbol that stands for a letter, next to letters ("g1ft", "k1ckback", "$tarbucks"); "$175" stays money.
  const leet = joined.replace(/[01345@$]/g, (c, i: number, s: string) => (/\p{L}/u.test(s[i - 1] ?? "") || /\p{L}/u.test(s[i + 1] ?? "") ? (LEET[c] ?? c) : c));
  return [...new Set([base, joined, leet])];
}

/** "Reimburse" is a plan paying her ("BCBS reimburses well"), or her paying them: only the first may be said. */
const REIMBURSE = /\breimburs\w*/i;
const PLAN_WORDS = /\b(?:insur\w*|plans?|payers?|medicare|medicaid|bcbs\w*|blue cross|aetna|cigna|united\w*|optum|tricare|humana|network|claims?|rates?|superbills?|out of network|benefits?)\b/i;

function offeredIn(text: string): string | null {
  for (const [pattern, what] of ALWAYS) if (pattern.test(text)) return what;
  const sentences = sentencesOf(text);
  if (sentences.some((s) => REIMBURSE.test(s) && !PLAN_WORDS.test(s))) return MONEY;
  let reward = REWARD.test(text);
  for (const s of sentences) {
    const tied = TIE.test(s);
    const money = MONEY_SAID.test(s) && !FEE_WORDS.test(s);
    if (money) reward = true;
    if (!tied) continue;
    if (money) return "a dollar amount";
    for (const [pattern, what] of TIED) if (pattern.test(s)) return what;
  }
  return reward && TIE.test(text) ? TRADE : null;
}

/**
 * What a text offers or mentions of value tied to referrals (a gift, a treat, money, a trade
 * for "each patient you send"), or null. Plain code, default-refuse.
 */
export function valueOffered(text: string): string | null {
  for (const v of valueVariants(text)) {
    const what = offeredIn(v);
    if (what) return what;
  }
  return null;
}
