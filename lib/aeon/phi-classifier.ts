// Layer 2 of the sensitive-info guard: a small named-entity model that finds
// people's names the rules can't ("Maria cancelled again"). It runs on this
// machine (or inside the Vercel function) with onnxruntime; text is never sent
// anywhere to be checked. Model: Xenova/bert-base-NER, int8 build (108 MB,
// MIT license). It downloads once into .cache/models (`npm run models:download`).
import path from "node:path";
import { fileURLToPath } from "node:url";

export const NER_MODEL = "Xenova/bert-base-NER";
const MIN_SCORE = 0.6;
// BERT reads up to 512 word pieces; longer text is checked in slices.
const MAX_CHARS = 1500;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Where the model lives: the repo's .cache locally, /tmp on Vercel (the only writable place). */
export function modelCacheDir(): string {
  return process.env.VERCEL ? "/tmp/practice-os-models" : path.join(REPO_ROOT, ".cache", "models");
}

type Token = { entity: string; word: string; score: number; index?: number };
type Ner = (text: string) => Promise<Token[]>;

let loading: Promise<Ner> | null = null;

/** Loads the model once per process. Rejects if it can't load: the guard then fails closed. */
export function loadNameFinder(): Promise<Ner> {
  loading ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = modelCacheDir();
    const run = await pipeline("token-classification", NER_MODEL, { dtype: "q8" });
    return async (text: string) => (await run(text)) as unknown as Token[];
  })();
  loading.catch(() => {
    loading = null; // try again on the next message
  });
  return loading;
}

/**
 * Joins word pieces back into whole entities: "Ta" + "##sha Green" is one name.
 * A word whose pieces carry different labels ("A" PER + "##etna" ORG) is not a name.
 *
 * The pipeline leaves out pieces it labels O, so a name with characters glued on
 * ("Ortiz" + "##t" (O) + "##m" + "##vez") comes back with a hole in it. A word
 * stops at its first missing piece (findNames stretches it back to the end of
 * the word), and words with a hole between them are separate entities.
 * A word is scored by its first piece and a name by its surest word, so junk
 * glued onto "Ortiz" can't drag "Kevin Ortiz" under MIN_SCORE.
 */
export function mergeEntities(tokens: Token[]): { label: string; text: string; score: number }[] {
  type Word = { labels: Set<string>; text: string; score: number; begins: boolean; start?: number; end?: number; cut: boolean };
  const next = (a?: number, b?: number) => a === undefined || b === undefined || b === a + 1;
  const words: Word[] = [];
  for (const t of tokens) {
    const label = t.entity.replace(/^[BI]-/, "");
    const last = words.at(-1);
    if (t.word.startsWith("##")) {
      // A piece belongs to the word right before it; one after a hole, or with no word, is left out.
      if (!last || last.cut || !next(last.end, t.index)) {
        if (last) last.cut = true;
        continue;
      }
      last.text += t.word.slice(2);
      last.labels.add(label);
      last.end = t.index;
    } else {
      const begins = t.entity.startsWith("B-");
      words.push({ labels: new Set([label]), text: t.word, score: t.score, begins, start: t.index, end: t.index, cut: false });
    }
  }
  const entities: { label: string; text: string; score: number }[] = [];
  for (const [i, w] of words.entries()) {
    const label = w.labels.size === 1 ? [...w.labels][0] : "MIXED";
    const prev = entities.at(-1);
    const joined = i > 0 && !words[i - 1].cut && next(words[i - 1].end, w.start);
    if (prev && prev.label === label && !w.begins && joined) {
      prev.text += ` ${w.text}`;
      prev.score = Math.max(prev.score, w.score);
    } else {
      entities.push({ label, text: w.text, score: w.score });
    }
  }
  return entities;
}

function slices(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += MAX_CHARS - 100) out.push(text.slice(i, i + MAX_CHARS));
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every person's name the model finds, as written in the text. A name must start
 * at the start of a word, and is stretched to the end of its last word (the model
 * sometimes returns "Okaf" for "Okafor", or "Ortiz" for "Ortiz7x"). The demo
 * label "[Sample]" is blanked first so its "Sam" isn't read as a name.
 *
 * The model reads each slice with digits and symbols glued to the end of a word
 * blanked out: "Kevin Ortiz&&&" otherwise reads as a firm like "Smith & Co".
 * Blanking keeps every position, so names are still found in the slice as written.
 *
 * Characters glued onto a name can also tip the model into reading two
 * capitalized words as a company ("Zelda Quintc", "Tasha Greens"). So every run
 * of two or more capitalized words the first read didn't already call a person
 * gets a second read on its own, in a plain sentence about a person. Real
 * companies, places and forms ("Blue Cross", "Psychology Today", "Lincoln
 * Park", "Good Faith Estimate") stay what they are, and runs with a street,
 * place or institution word (PLACE_WORDS) or a weekday or month are skipped.
 */
const GLUED_TAIL = /(?<=\p{L})[\p{P}\p{S}\p{N}_]+(?=\s|$)/gu;
const WORD_TAIL = "[\\p{L}\\p{M}\\p{N}_'’-]*";
const CAPITALIZED_RUN = new RegExp(`(?<![\\p{L}\\p{N}])\\p{Lu}\\p{Ll}${WORD_TAIL}(?:[ \\t]+\\p{Lu}\\p{Ll}${WORD_TAIL})+`, "gu");
const CALENDAR_WORDS = new Set(
  (
    "Mon Tue Tues Wed Thu Thur Thurs Fri Sat Sun Monday Tuesday Wednesday Thursday Friday Saturday Sunday " +
    "Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec January February March April May June July August " +
    "September October November December"
  ).split(" "),
);
// Words that make a run a street, place or institution, never a person:
// "Martin Luther King Drive", "Logan Square", "Rush University Medical Center".
const PLACE_WORDS = new Set(
  (
    "Drive Dr Street St Avenue Ave Boulevard Blvd Road Rd Lane Ln Court Ct Place Pl Way Parkway Pkwy Terrace Ter " +
    "Highway Hwy Expressway Plaza Square Park Circle Trail Row Loop Bridge Lake Shore Station Building Tower " +
    "Hospital Hospitals Center Centre Clinic Clinics University College School Academy Institute Health Healthcare " +
    "Medical Medicine Insurance Counseling Therapy Services Group Associates Partners Practice Foundation Network " +
    "Department Dept County City Village Township State Library Church Museum Bank Company Inc Corp LLC PLLC"
  ).split(" "),
);
// Products, services and on-screen words Aeon names when it walks her through
// the app: "Link Instagram", "Meta Business Suite", "Connect Cal". In "I spoke
// with ___ yesterday." these read as people, so runs with one are skipped too.
const APP_WORDS = new Set(
  (
    "Aeon Muse Meta Instagram Facebook Threads WhatsApp Google Gmail Calendar Cal Twilio Spruce Vercel Supabase " +
    "Psychology Today Zoom CAQH ProView NPPES NPI Medicare Medicaid PECOS IDFPR BCBS Aetna Cigna Optum Humana " +
    "Settings Connections Connection Connect Disconnect Link Unlink Account Accounts Profile Professional Business " +
    "Creator Suite App Apps Page Pages Tab Button Menu Home Admin Approvals Approval Referrals Referral Front Desk " +
    "Memory Chat Inbox Post Posts Draft Drafts Login Sign Setup Dashboard Developer Developers Tools Center Help " +
    "Support Key Token API Form Forms Estimate Superbill Superbills Deadline Deadlines Credentialing Insurance"
  ).split(" "),
);
// A second read costs one more model call, so each 1500-character slice gets at
// most this many. Past the cap it does not fail closed: the first read still
// covers every word, and the second read is an extra net for names with odd
// characters glued on. Memories, messages and replies are short and stay far
// under it; only long tool results (rule text, lists) reach it, and failing
// closed there would withhold official sources.
const MAX_SECOND_READS = 24;

export async function findNames(text: string): Promise<string[]> {
  const ner = await loadNameFinder();
  const names: string[] = [];
  const located = (name: string, slice: string) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}${WORD_TAIL}`, "u").exec(slice)?.[0];
  const people = async (input: string) =>
    mergeEntities(await ner(input)).filter((e) => e.label === "PER" && e.score >= MIN_SCORE && e.text.length >= 2);

  for (const slice of slices(text.replace(/\[Sample\]/g, "        "))) {
    const read = slice.replace(GLUED_TAIL, (m) => " ".repeat(m.length));
    for (const e of await people(read)) {
      // Fails closed: a name the model is sure of still counts when it can't be found as written.
      names.push(located(e.text, slice) ?? e.text);
    }

    // Runs come from the slice as written, so a comma still separates "Fri, Nov 6".
    const runs = new Set<string>();
    for (const m of slice.matchAll(CAPITALIZED_RUN)) {
      const run = m[0].trim();
      if (run.split(/\s+/).some((w) => CALENDAR_WORDS.has(w) || PLACE_WORDS.has(w) || APP_WORDS.has(w))) continue;
      if (names.some((n) => run.includes(n) || n.includes(run))) continue;
      runs.add(run);
    }
    for (const run of [...runs].slice(0, MAX_SECOND_READS)) {
      for (const e of await people(`I spoke with ${run} yesterday.`)) {
        if (run.includes(e.text)) names.push(located(e.text, slice) ?? e.text);
      }
    }
  }
  return names;
}
