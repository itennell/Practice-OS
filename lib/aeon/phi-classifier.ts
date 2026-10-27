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

type Token = { entity: string; word: string; score: number };
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
 */
export function mergeEntities(tokens: Token[]): { label: string; text: string; score: number }[] {
  const words: { labels: Set<string>; text: string; score: number; begins: boolean }[] = [];
  for (const t of tokens) {
    const label = t.entity.replace(/^[BI]-/, "");
    const piece = t.word.startsWith("##");
    const last = words.at(-1);
    if (piece && last) {
      last.text += t.word.slice(2);
      last.labels.add(label);
      last.score = Math.min(last.score, t.score);
    } else {
      words.push({ labels: new Set([label]), text: t.word, score: t.score, begins: t.entity.startsWith("B-") });
    }
  }
  const entities: { label: string; text: string; score: number }[] = [];
  for (const w of words) {
    const label = w.labels.size === 1 ? [...w.labels][0] : "MIXED";
    const prev = entities.at(-1);
    if (prev && prev.label === label && !w.begins) {
      prev.text += ` ${w.text}`;
      prev.score = Math.min(prev.score, w.score);
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

/** Every person's name the model finds, as written. */
export async function findNames(text: string): Promise<string[]> {
  const ner = await loadNameFinder();
  const names: string[] = [];
  for (const slice of slices(text)) {
    for (const e of mergeEntities(await ner(slice))) {
      if (e.label === "PER" && e.score >= MIN_SCORE && e.text.length > 1) names.push(e.text);
    }
  }
  return names;
}
