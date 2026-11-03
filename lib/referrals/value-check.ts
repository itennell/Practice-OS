// Nothing of value may be tied to a referral (AGENTS.md: never charge or pay per
// referral; no fees, gifts or anything of value tied to referrals). Plain code,
// default-refuse: any gift, treat or store card in a letter is refused, and so
// is any trade of something for "each patient you send", with or without a
// dollar amount. Her own fees, the plans she takes, private pay and superbills
// are allowed: offices ask about them before they refer ("my fee is $175").
// A cup of coffee to introduce herself ("I'd love to grab coffee") is allowed;
// coffee "on me", or for referrals, is not. Used by every letter check
// (lib/referrals/outreach.ts checkLetter, the approval executor, the debrief
// follow-up) and by card notes (lib/referrals/contacts.ts checkNote).

/** Something of value: a gift, a treat, a store card, a meal paid for. */
const GIFTS: [RegExp, string][] = [
  [/\b(?:gifts?|gift ?cards?|gift certificates?|vouchers?|e-?gift\w*|prepaid cards?)\b/i, "a gift or something free"],
  [/\b(?:goodies|goody|goodie|baskets?|swag|merch|flowers|bouquets?|cookies|cupcakes|pastr(?:y|ies)|bagels|donuts|doughnuts|chocolates?|wine|champagne|catered|catering|tickets?)\b/i, "a gift or something free"],
  [/\b(?:treats?\s+for\s+(?:you|your|the)\b|sweet treats?|treat (?:you|your (?:team|staff|office))\b)/i, "a gift or something free"],
  [/\b(?:lunch|dinner|happy hours?|drinks on)\b/i, "a gift or something free"],
  [/\b(?:starbucks|amazon|dunkin'?|uber ?eats|doordash|grubhub|venmo|paypal|cash ?app|zelle)\b/i, "a gift or something free"],
  [/\b(?:visa|mastercard|target|store|restaurant|coffee|spa)\s+(?:gift\s+)?cards?\b/i, "a gift or something free"],
  // "Coffee's on me", "the first round is on us"; never "count on me".
  [/\b(?:coffee|lunch|drinks?|dinner|breakfast|pizza|meals?|treats?|round|it|this|that|the (?:first|next) (?:one|round))(?:\s+is|\s+are|'s|'re)?\s+on\s+(?:me|us|my practice|our practice)\b/i, "a gift or something free"],
  [/\b(?:buy|get|bring|treat)\s+(?:you|your (?:team|staff|office|front desk)|the (?:team|staff|office))\s+(?:a\s+|some\s+|to\s+)?(?:coffee|lunch|dinner|drinks?|breakfast|pizza|meals?|treats?|snacks?)\b/i, "a gift or something free"],
  [/\bfree (?:session|sessions|consult\w*|month|months|visit|visits|therapy|services?)\b/i, "a gift or something free"],
  [/\b(?:donat\w*|sponsor\w*)\b/i, "a gift or something free"],
];

/** A trade: something in return for referrals, with or without a dollar amount. */
const TRADES: [RegExp, string][] = [
  [/\$\s?\d[^.!?\n]*\b(?:referr\w*|each|every|per|new client|send)\b|\b(?:referr\w*|each|every|per)\b[^.!?\n]*\$\s?\d/i, "a dollar amount"],
  [/\b(?:pay|paid|paying)\s+(?:you|your)\b|\bget(?:s|ting)?\s+paid\b|\bpaid\s+for\s+(?:a\s+|each\s+|every\s+|your\s+)?referrals?\b|\b(?:referral|finder'?s)\s+fees?\b/i, "money or payment"],
  [/\b(?:compensat\w*|commissions?|kickbacks?|rebates?|discount\w*|coupons?|honorari(?:um|a|ums)|gratuit(?:y|ies)|stipends?|remunerat\w*|revenue shar\w*|split the fee)\b/i, "money or payment"],
  [/\b(?:per referral|for each referral|for every referral|for any referral|per (?:new )?(?:patient|client)|in exchange for|in return|in appreciation|reward\w*|incentive\w*|bonus\w*|perks?)\b/i, "something in return for referrals"],
  // "for each new patient you send", "every client your team refers", "each patient referred to me".
  [/\b(?:each|every|per|any)\s+(?:new\s+|single\s+)?(?:patient|client|referral|person|people|family|families|individual|one|kid|child|couple)s?\s+(?:\w+\s+){0,3}?(?:send|sends|sent|refer|refers|referred|pass|passes|direct|directs)\b/i, "something in return for referrals"],
  [/\b(?:for|with)\s+(?:each|every)\s+new\s+(?:patient|client|referral|person|family)s?\b/i, "something in return for referrals"],
  [/\b(?:each|every)\s+time\s+(?:you|they|your (?:team|office|staff|practice))\s+(?:send|refer)\w*/i, "something in return for referrals"],
  [/\b(?:if|when|once|whenever)\s+(?:you|they|your (?:team|office|staff|practice))\s+(?:send|refer)\w*\b[^.!?\n]{0,80}\b(?:I'll|I will|we'll|we will|I'd|I would|you'll get|you get)\b/i, "something in return for referrals"],
  [/\b(?:I'll|I will|we'll|we will|I'd|I would)\s+(?:drop off|bring|send|buy|treat|give|get|cover|pay)\b[^.!?\n]{0,80}\b(?:if|when|once|whenever)\s+(?:you|they|your (?:team|office|staff|practice))\s+(?:send|refer)\w*/i, "something in return for referrals"],
  [/\bas (?:a|my|our) (?:small |little |big )?thank[- ]?you\b|\btokens? of (?:my|our) (?:appreciation|thanks|gratitude)\b|\bthank[- ]?you (?:gift|basket|lunch|treat|present)s?\b/i, "something in return for referrals"],
  // A share of her fees, free services for referrals, and the same offers in Spanish.
  [/(?:\b\d+(?:\.\d+)?\s*(?:%|percent\b|per\s+cent\b)|\b(?:cut|share|portion|percentage)\s+of\b)[^.!?\n]{0,40}\b(?:fees?|revenue|income|billing|referr\w*|each\s+client)\b/i, "a share of fees"],
  [/\bfree\b[^.!?\n]{0,40}\b(?:sessions?|therapy|consult\w*|services?|visits?|months?)\b[^.!?\n]*\b(?:if|when|for|so|as long as)\b|\b(?:if|when)\s+(?:they|you|she|he)\s+send\b[^.!?\n]*\bfree\b/i, "something free in return for referrals"],
  [/\bd[oó]lares\b|\bpor\s+cada\s+(?:referid|paciente|cliente)\w*|\bcomisi[oó]n\b|\bregalos?\b|\bgratis\b|\btarjeta de regalo\b/i, "money or payment"],
];

/** Every rule, gifts and trades: what a text offers of value tied to referrals. */
export const VALUE_RULES: readonly [RegExp, string][] = [...TRADES, ...GIFTS];

/**
 * What a text offers or mentions of value tied to referrals (a gift, a treat, money, a trade
 * for "each patient you send"), or null. Plain code, default-refuse.
 */
export function valueOffered(text: string): string | null {
  for (const [pattern, what] of VALUE_RULES) if (pattern.test(text)) return what;
  return null;
}
