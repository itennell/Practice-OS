// npm run eval:instagram [runs]: scores Aeon's first move on the Instagram content-coach
// requests in evals/instagram.jsonl against live muse-spark-1.3, the way the chat asks
// (SOUL.md, her practice, the shared tool list). Tools are not run: this scores the choice.
//   tool  - the first round calls one of the expected tools ("" in the list: no tool is fine)
//   args  - for cases that name arguments, the call carries them
//   coach - for cases with not_tools, the first move never drafts before she picks
// Crisis cases never reach the model: the plain-code check answers.
// Writes evals/results/instagram-<date>.json and prints a summary.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../lib/env";

loadEnv();
const { prepareDatabase } = await import("../lib/local-db");
if (!process.env.DATABASE_URL) await prepareDatabase();
const { chat, readToolCalls } = await import("../lib/meta");
const { systemPrompt } = await import("../lib/aeon/agent");
const { chatTools } = await import("../lib/aeon/tools");
const { guard } = await import("../lib/aeon/guard");
const { checkCrisis } = await import("../lib/safety");
const { getProfile } = await import("../lib/profile");
const { practiceToday } = await import("../lib/compliance/store");
const { closeDb } = await import("../lib/db");

type Case = {
  id: string;
  message: string;
  history?: [("clinician" | "aeon"), string][];
  tools?: string[];
  args?: Record<string, string>;
  pre?: "crisis" | "refused";
  not_tools?: string[];
};
type Msg = { role: "system" | "user" | "assistant"; content: string };

const RUNS = Number(process.argv[2] ?? 3);
const cases: Case[] = (await readFile("evals/instagram.jsonl", "utf8")).trim().split("\n").map((l) => JSON.parse(l));
const today = await practiceToday();
const profile = await getProfile().catch(() => null);
const system = systemPrompt([], today, profile);
const tools = chatTools();

function get(obj: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** "payer|query": "bcbs" passes when any of those fields holds "bcbs" (any case). */
function argsMatch(args: unknown, want: Record<string, string>): boolean {
  return Object.entries(want).every(([keys, values]) =>
    keys.split("|").some((k) => {
      const v = get(args, k);
      const s = typeof v === "string" ? v.toLowerCase() : v === undefined ? "" : JSON.stringify(v).toLowerCase();
      return values.split("|").some((x) => s.includes(x.toLowerCase()));
    }),
  );
}

async function firstMove(messages: Msg[], toolList = tools) {
  const res = await chat("eval.instagram", { messages, tools: toolList });
  const reply = res.choices[0]?.message;
  const calls = reply ? readToolCalls(reply) : [];
  return { calls: calls.map((c) => ({ name: c.name, args: c.args })), text: reply?.content ?? "" };
}

type Row = { id: string; run: number; tool_ok: boolean; args_ok: boolean | null; got: string[]; note?: string };
const rows: Row[] = [];

for (let run = 1; run <= RUNS; run++) {
  for (const c of cases) {
    if (c.pre) {
      const crisis = checkCrisis(c.message).crisis;
      const refused = !crisis && !(await guard(c.message, "message")).ok;
      const ok = c.pre === "crisis" ? crisis : refused;
      rows.push({ id: c.id, run, tool_ok: ok, args_ok: null, got: [crisis ? "(crisis reply)" : refused ? "(privacy refusal)" : "(reached model)"] });
      continue;
    }
    const messages: Msg[] = [
      { role: "system", content: system },
      ...(c.history ?? []).map(([role, content]): Msg => ({ role: role === "clinician" ? "user" : "assistant", content })),
      { role: "user", content: c.message },
    ];
    try {
      const move = await firstMove(messages);
      const names = move.calls.map((x) => x.name);
      const want = c.tools ?? [];
      const toolOk = want.length === 0 ? names.length === 0 : names.length === 0 ? want.includes("") : names.some((n) => want.includes(n));
      const coachOk = !c.not_tools || !names.some((n) => c.not_tools!.includes(n));
      const hit = move.calls.find((x) => want.includes(x.name));
      const argsOk = c.args ? Boolean(hit && argsMatch(hit.args, c.args)) : null;
      rows.push({ id: c.id, run, tool_ok: toolOk && coachOk, args_ok: argsOk, got: names.length ? move.calls.map((x) => `${x.name} ${JSON.stringify(x.args)}`) : [`(no tool) ${move.text.slice(0, 80)}`] });
    } catch (err) {
      rows.push({ id: c.id, run, tool_ok: false, args_ok: c.args ? false : null, got: [], note: err instanceof Error ? err.message : String(err) });
    }
    process.stdout.write(rows.at(-1)!.tool_ok ? "." : "x");
  }
  process.stdout.write(` run ${run}\n`);
}

const scored = rows;
const toolRate = scored.filter((r) => r.tool_ok).length / scored.length;
const withArgs = scored.filter((r) => r.args_ok !== null);
const argsRate = withArgs.filter((r) => r.args_ok).length / withArgs.length;
const perCase = cases.map((c) => {
  const mine = rows.filter((r) => r.id === c.id);
  return { id: c.id, tool: `${mine.filter((r) => r.tool_ok).length}/${mine.length}`, args: c.args ? `${mine.filter((r) => r.args_ok).length}/${mine.length}` : "-", got: mine.map((r) => r.got[0] ?? r.note ?? "") };
});
const summary = { model: "muse-spark-1.3", date: today, runs: RUNS, cases: cases.length, tool_accuracy: Number(toolRate.toFixed(3)), args_accuracy: Number(argsRate.toFixed(3)), per_case: perCase };
await mkdir("evals/results", { recursive: true });
const out = path.join("evals", "results", `instagram-${today}.json`);
await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\ntool choice ${(toolRate * 100).toFixed(1)}% (${scored.filter((r) => r.tool_ok).length}/${scored.length}), arguments ${(argsRate * 100).toFixed(1)}% (${withArgs.filter((r) => r.args_ok).length}/${withArgs.length})`);
for (const p of perCase) console.log(`${p.tool === `${RUNS}/${RUNS}` ? " " : "!"} ${p.id.padEnd(20)} tool ${p.tool} args ${p.args}  ${p.got[0]?.slice(0, 90)}`);
console.log(`saved ${out}`);
await closeDb();
