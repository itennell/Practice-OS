// npm run eval:studio [runs]: scores the studio's chat edits (evals/studio-edits.jsonl)
// against live muse-spark-1.3. Each instruction goes through the same path as the app:
// Muse proposes edit operations for a fixed document, plain code validates and applies
// them (lib/studio/ops.ts) and runs the plain-code safety check (lib/studio/check.ts).
// Graded by plain code on the resulting document, never by a model.
// Writes evals/results/studio-<date>.json and prints a summary.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../lib/env";

loadEnv();
const { prepareDatabase } = await import("../lib/local-db");
if (!process.env.DATABASE_URL) await prepareDatabase();
const { proposeEdit } = await import("../lib/studio/edit");
const { applyOps } = await import("../lib/studio/ops");
const { textProblems } = await import("../lib/studio/check");
const { changedWords } = await import("../lib/studio/check");
const { emptyDoc } = await import("../lib/studio/doc");
const { closeDb } = await import("../lib/db");
type StudioDoc = import("../lib/studio/doc").StudioDoc;

type Check = { path?: string; equals?: unknown; contains?: string; shorter?: boolean; same?: boolean; effect?: string; unchanged?: boolean };
type Case = { id: string; doc: "reel" | "video"; say: string; expect: Check[] };

const DOCS: Record<Case["doc"], StudioDoc> = {
  reel: {
    ...emptyDoc("reel", "how booking works"),
    title: "How booking works",
    caption: "Booking takes two steps. Pick a time, then we talk for 15 minutes, free. Link in bio.\n\nDana Reyes, LCPC (fictional demo practice)",
    slides: [
      { id: "s1", kind: "picture", text: "", seconds: 4 },
      { id: "s2", kind: "point", text: "Pick a time that works for you on the online booking page", seconds: 4 },
      { id: "s3", kind: "point", text: "We talk for 15 minutes first, free, by phone", seconds: 4 },
      { id: "s4", kind: "book", text: "Book a free call. Link in bio.", seconds: 3 },
    ],
  },
  video: {
    ...emptyDoc("video", "a tour of the office"),
    clips: [{ id: "c1", source: "opfs:eval", name: "tour.mp4", duration: 10, in: 0, out: 10 }],
  },
};

function at(doc: StudioDoc, p: string): unknown {
  const parts = p.split(".");
  let cur: unknown = doc;
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i];
    if (k === "*") return (cur as unknown[]).map((x) => parts.slice(i + 1).reduce((o: unknown, kk) => (o as Record<string, unknown>)?.[kk], x));
    cur = (cur as Record<string, unknown>)?.[k];
  }
  return cur;
}

function grade(c: Case, before: StudioDoc, after: StudioDoc, effects: string[]): string[] {
  const misses: string[] = [];
  for (const e of c.expect) {
    if (e.unchanged) {
      if (JSON.stringify(before) !== JSON.stringify(after)) misses.push("document changed");
      continue;
    }
    if (e.effect) {
      if (!effects.includes(e.effect)) misses.push(`no ${e.effect} effect`);
      continue;
    }
    const v = at(after, e.path!);
    if ("equals" in e && JSON.stringify(v) !== JSON.stringify(e.equals)) misses.push(`${e.path} = ${JSON.stringify(v)}, wanted ${JSON.stringify(e.equals)}`);
    if (e.contains && !String(v).includes(e.contains)) misses.push(`${e.path} = ${JSON.stringify(v)}, wanted it to contain ${JSON.stringify(e.contains)}`);
    if (e.shorter && !(String(v).length < String(at(before, e.path!)).length)) misses.push(`${e.path} not shorter`);
    if (e.same && JSON.stringify(v) !== JSON.stringify(at(before, e.path!))) misses.push(`${e.path} changed`);
  }
  return misses;
}

const RUNS = Number(process.argv[2] ?? 1);
const cases: Case[] = (await readFile("evals/studio-edits.jsonl", "utf8")).trim().split("\n").map((l) => JSON.parse(l));
const results: { id: string; run: number; pass: boolean; ms: number; reply: string; ops: unknown[]; outcome: string; misses: string[] }[] = [];

for (let run = 1; run <= RUNS; run++) {
  for (const c of cases) {
    const before = structuredClone(DOCS[c.doc]);
    const started = Date.now();
    let after = before;
    let effects: string[] = [];
    let outcome = "applied";
    let proposal: { reply: string; ops: unknown[] } = { reply: "", ops: [] };
    try {
      proposal = await proposeEdit(c.say, before);
      if (!proposal.ops.length) outcome = "no ops";
      else {
        const r = applyOps(before, proposal.ops, { from: "chat" });
        if (!r.ok) outcome = `refused by code: ${r.why}`;
        else {
          // The plain-code safety check the app runs before saving (Muse's critic is skipped here).
          const problems = changedWords(before, r.doc).flatMap((w) => textProblems(w, { neverShow: [] }));
          if (problems.length) outcome = `held by safety: ${problems[0]}`;
          else {
            after = r.doc;
            effects = r.effects.map((e) => e.kind);
          }
        }
      }
    } catch (err) {
      outcome = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    const misses = outcome.startsWith("error") ? [outcome] : grade(c, before, after, effects);
    results.push({ id: c.id, run, pass: misses.length === 0, ms: Date.now() - started, reply: proposal.reply, ops: proposal.ops, outcome, misses });
    console.log(`${misses.length ? "MISS" : "pass"}  ${c.id.padEnd(18)} ${String(Date.now() - started).padStart(6)} ms  ${outcome}${misses.length ? `  (${misses.join("; ")})` : ""}`);
  }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} chat edits applied correctly on muse-spark-1.3.`);
await mkdir("evals/results", { recursive: true });
const file = path.join("evals/results", `studio-${new Date().toISOString().slice(0, 10)}.json`);
await writeFile(file, `${JSON.stringify({ model: "muse-spark-1.3", runs: RUNS, passed, total: results.length, results }, null, 2)}\n`);
console.log(`Wrote ${file}`);
await closeDb();
