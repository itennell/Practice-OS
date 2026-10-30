// Is this record from another source the same provider as the card? NPI first;
// without an NPI on both, the name has to match AND the street (or the phone),
// or, for lists that only give a city (the state license list), the name and
// city, which the caller accepts only when it is the one such person there.
import { jaroWinkler, normalizeName, normalizeOrg, normalizeStreet, phoneDigits, zip5 } from "./normalize";

export type Candidate = {
  npi?: string | null;
  name?: string | null;
  /** A group's name. A person's card may carry the group they work at; that doesn't decide a match. */
  organization?: string | null;
  isOrg?: boolean;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  phone?: string | null;
};

export type MatchMethod = "npi" | "name_address" | "name_city";
export type Match = { method: MatchMethod; score: number };

/** At or above this, two names are the same person (tuned on tests/fixtures/referrals/merge-set.ts). */
export const NAME_MIN = 0.92;

// Common nicknames, each group one person's name. "Priya" and "Prakash" look
// alike to a string score, so first names must be the same or in one group.
const NICKNAMES: string[][] = [
  ["robert", "rob", "bob", "bobby", "robbie", "bert"], ["william", "will", "bill", "billy", "liam"],
  ["richard", "rich", "rick", "dick", "ricky"], ["james", "jim", "jimmy", "jamie"], ["john", "jack", "johnny", "jon"],
  ["joseph", "joe", "joey"], ["michael", "mike", "mikey"], ["thomas", "tom", "tommy"], ["charles", "charlie", "chuck"],
  ["christopher", "chris"], ["christine", "chris", "christina", "tina"], ["daniel", "dan", "danny"], ["matthew", "matt"],
  ["anthony", "tony"], ["andrew", "andy", "drew"], ["edward", "ed", "eddie", "ted", "ned"], ["steven", "stephen", "steve"],
  ["jonathan", "johnathan", "jonathon", "jon"], ["nicholas", "nick"], ["benjamin", "ben"], ["samuel", "sam"], ["samantha", "sam"],
  ["alexander", "alex", "xander"], ["alexandra", "alex", "sasha"], ["timothy", "tim"], ["patrick", "pat"], ["patricia", "pat", "patty", "trish"],
  ["elizabeth", "liz", "beth", "betsy", "eliza", "lizzie"], ["margaret", "maggie", "meg", "peggy"], ["katherine", "catherine", "kathryn", "kate", "katie", "kathy", "cathy"],
  ["jennifer", "jen", "jenny"], ["susan", "sue", "susie"], ["deborah", "debra", "deb", "debbie"], ["rebecca", "becky", "becca"],
  ["victoria", "vicky", "tori"], ["abigail", "abby"], ["kimberly", "kim"], ["jessica", "jess"], ["gregory", "greg"],
  ["jeffrey", "jeff"], ["kenneth", "ken", "kenny"], ["ronald", "ron"], ["donald", "don"], ["lawrence", "larry"],
  ["frederick", "fred"], ["raymond", "ray"], ["douglas", "doug"], ["gerald", "jerry"], ["peter", "pete"],
];
const NICK = new Map<string, Set<number>>();
NICKNAMES.forEach((group, i) => group.forEach((n) => NICK.set(n, (NICK.get(n) ?? new Set()).add(i))));

/** The same first name, or two forms of one (Robert and Bob). */
export function sameFirstName(a: string, b: string): boolean {
  if (a === b) return true;
  const ga = NICK.get(a);
  const gb = NICK.get(b);
  return Boolean(ga && gb && [...ga].some((g) => gb.has(g)));
}

/** 0 to 1: how alike two people's names are. Last name counts more; a different last name is 0. */
export function personNameScore(a: string | null | undefined, b: string | null | undefined): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x.last || !y.last) return 0;
  const last = Math.max(...x.lasts.flatMap((a) => y.lasts.map((b) => jaroWinkler(a, b))));
  if (last < 0.94) return 0;
  // One list may give only the last name.
  if (!x.first || !y.first || x.tokens.length === 1 || y.tokens.length === 1) return last * 0.9;
  // Both give a first name: it has to be the same one (or a nickname of it), not just look alike.
  if (!sameFirstName(x.first, y.first)) return 0;
  return 0.6 * last + 0.4;
}

export function orgNameScore(a: string | null | undefined, b: string | null | undefined): number {
  const x = normalizeOrg(a);
  const y = normalizeOrg(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const xs = x.split(" ");
  const ys = y.split(" ");
  const [short, long] = xs.length <= ys.length ? [xs, ys] : [ys, xs];
  // "Northside Family Medicine" vs "Northside Family Medicine Associates": every word of the
  // shorter name, whole and in order, starts the longer one ("Northside Fam" is not a match).
  if (short.length >= 2 && short.every((w, i) => long[i] === w)) return 0.95;
  // Otherwise the same words, each spelled nearly alike ("Center" / "Centre"), and the whole name close.
  if (xs.length !== ys.length || !xs.every((w, i) => w === ys[i] || (w.length >= 4 && jaroWinkler(w, ys[i]) >= 0.9))) return Math.min(jaroWinkler(x, y), 0.85);
  return jaroWinkler(x, y);
}

function sameStreet(a: Candidate, b: Candidate): boolean {
  const za = zip5(a.zip);
  const zb = zip5(b.zip);
  if (!za || za !== zb) return false;
  const sa = normalizeStreet(a.street);
  const sb = normalizeStreet(b.street);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const [na, ...ra] = sa.split(" ");
  const [nb, ...rb] = sb.split(" ");
  return /^\d+$/.test(na) && na === nb && jaroWinkler(ra.join(" "), rb.join(" ")) >= 0.9;
}

/** How the other record matches the card, or null when it is someone else. */
export function matchCandidate(card: Candidate, other: Candidate): Match | null {
  if (card.npi && other.npi) return card.npi === other.npi ? { method: "npi", score: 1 } : null;
  const org = Boolean(card.isOrg ?? other.isOrg);
  const score = org ? orgNameScore(card.organization ?? card.name, other.organization ?? other.name) : personNameScore(card.name, other.name);
  if (score < NAME_MIN) return null;
  const phone = phoneDigits(card.phone);
  if (sameStreet(card, other) || (phone && phone === phoneDigits(other.phone))) return { method: "name_address", score: round(score) };
  if (!other.street && !other.zip && card.city && other.city && card.city.trim().toLowerCase() === other.city.trim().toLowerCase()) {
    return { method: "name_city", score: round(score * 0.9) };
  }
  return null;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
