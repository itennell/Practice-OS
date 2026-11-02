// A fact changed in one place changes everywhere. When an edit swaps a price, a
// day, a time or a consult length on a slide (or in the caption), the same old
// value left in the headline, the other slides or the caption is swapped too, so
// the slide and the caption never disagree ("updated the fee slide" once left
// $150 in the caption). Pure: no model, no database. The new value is then checked
// against her saved facts like any edit (check.ts, lib/media/truth.ts).
import type { StudioDoc } from "./doc";

type Field = { key: string; text: string };

const CATEGORIES: { name: string; find: RegExp; key: (s: string) => string; swap: (text: string, from: string, to: string) => string }[] = [
  {
    name: "price",
    find: /\$\s?\d+(?:,\d{3})*(?:\.\d{2})?/g,
    key: (s) => s.replace(/\s|,/g, "").replace(/\.00$/, ""),
    swap: (text, from, to) => text.replace(new RegExp(`\\$\\s?${from.slice(1).replace(/\B(?=(\d{3})+(?!\d))/g, ",?")}(?:\\.00)?(?!\\d)`, "g"), to),
  },
  {
    name: "day",
    find: /\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days?\b/gi,
    key: (s) => s.toLowerCase().replace(/s$/, ""),
    swap: (text, from, to) =>
      text.replace(new RegExp(`\\b${from}(s?)\\b`, "gi"), (m, plural: string) => {
        const word = to.replace(/s$/, "") + plural;
        return /^[A-Z]/.test(m) ? word[0].toUpperCase() + word.slice(1) : word;
      }),
  },
  {
    name: "minutes",
    find: /\b\d{1,3}[- ]min(?:ute)?s?\b/gi,
    key: (s) => s.match(/\d+/)![0],
    swap: (text, from, to) => text.replace(new RegExp(`\\b${from}([- ]min(?:ute)?s?)\\b`, "gi"), `${to}$1`),
  },
  {
    name: "time",
    find: /\b\d{1,2}(?::\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.)/gi,
    key: (s) => s.toLowerCase().replace(/\s|\./g, ""),
    swap: (text, from, to) => {
      const digits = from.match(/^[\d:]+/)![0];
      const half = /p/i.test(from) ? "p(?:\\.m\\.|m)" : "a(?:\\.m\\.|m)";
      return text.replace(new RegExp(`\\b${digits}\\s?${half}`, "gi"), to);
    },
  },
];

function fields(doc: StudioDoc): Field[] {
  return [
    { key: "title", text: doc.title },
    { key: "caption", text: doc.caption },
    ...doc.slides.map((s) => ({ key: `slide:${s.id}`, text: s.text })),
    ...doc.overlays.map((o) => ({ key: `overlay:${o.id}`, text: o.text })),
  ];
}

const tokens = (text: string, find: RegExp, key: (s: string) => string) => new Set([...text.matchAll(find)].map((m) => key(m[0])));

/** Display form of a key for the swap: what the edited field actually wrote. */
function shown(texts: string[], find: RegExp, key: (s: string) => string, k: string): string {
  for (const t of texts) for (const m of t.matchAll(find)) if (key(m[0]) === k) return m[0];
  return k;
}

const WHERE: Record<string, string> = { title: "the headline", caption: "the caption" };
const where = (key: string) => WHERE[key] ?? (key.startsWith("slide:") ? "the other slides" : "the video text");

/**
 * Carries a changed fact from the fields the edit touched to the fields it didn't.
 * Only a clean one-for-one swap is carried (one old value gone, one new value in);
 * anything murkier is left alone for the fact check to judge.
 */
export function syncFacts(before: StudioDoc, next: StudioDoc): { doc: StudioDoc; notes: string[] } {
  const old = new Map(fields(before).map((f) => [f.key, f.text]));
  const now = fields(next);
  const changed = now.filter((f) => old.has(f.key) && old.get(f.key) !== f.text);
  const untouched = now.filter((f) => old.get(f.key) === f.text);
  if (!changed.length || !untouched.length) return { doc: next, notes: [] };
  const swaps: { from: string; to: string; name: string; swap: (typeof CATEGORIES)[number]["swap"] }[] = [];
  for (const c of CATEGORIES) {
    const removed = new Set<string>();
    const added = new Set<string>();
    for (const f of changed) {
      const a = tokens(old.get(f.key)!, c.find, c.key);
      const b = tokens(f.text, c.find, c.key);
      for (const x of a) if (!b.has(x)) removed.add(x);
      for (const x of b) if (!a.has(x)) added.add(x);
    }
    if (removed.size !== 1 || added.size !== 1) continue;
    const [from] = removed;
    const [toKey] = added;
    const to = shown(changed.map((f) => f.text), c.find, c.key, toKey);
    swaps.push({ from: shown(changed.map((f) => old.get(f.key)!), c.find, c.key, from), to, name: c.name, swap: c.swap });
  }
  if (!swaps.length) return { doc: next, notes: [] };
  const updated = new Map<string, string>();
  for (const f of untouched) {
    let t = f.text;
    for (const s of swaps) t = s.swap(t, s.name === "day" ? s.from.replace(/s$/i, "") : s.name === "minutes" ? s.from.match(/\d+/)![0] : s.from, s.name === "minutes" ? s.to.match(/\d+/)![0] : s.to);
    if (t !== f.text) updated.set(f.key, t);
  }
  if (!updated.size) return { doc: next, notes: [] };
  const doc: StudioDoc = {
    ...next,
    title: updated.get("title") ?? next.title,
    caption: updated.get("caption") ?? next.caption,
    slides: next.slides.map((s) => (updated.has(`slide:${s.id}`) ? { ...s, text: updated.get(`slide:${s.id}`)! } : s)),
    overlays: next.overlays.map((o) => (updated.has(`overlay:${o.id}`) ? { ...o, text: updated.get(`overlay:${o.id}`)! } : o)),
  };
  const places = [...new Set([...updated.keys()].map(where))];
  const notes = swaps.map((s) => `also changed ${s.from} to ${s.to} in ${places.join(" and ")}`);
  return { doc, notes };
}
