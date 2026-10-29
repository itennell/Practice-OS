// npm run eval:documents [runs]: scores Aeon's first move on the document requests in
// evals/documents.jsonl against live muse-spark-1.3, the way the chat asks (SOUL.md,
// her practice, the shared tool list). Tools are not run: this scores the choice.
//   tool  - the first round calls one of the expected tools (or none, when none is expected)
//   args  - for cases that name arguments, the call carries them
// Crisis and client-detail cases never reach the model: the plain-code checks answer.
// Also replays Isaiah's Oct 28 turn (chat_messages 883) with the Oct 28 SOUL.md and
// tool list ("before") and today's ("after").
// Writes evals/results/documents-<date>.json and prints a summary.
import { execFileSync } from "node:child_process";
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
  no_upload_ask?: boolean;
};
type Msg = { role: "system" | "user" | "assistant"; content: string };

const RUNS = Number(process.argv[2] ?? 3);
const UPLOAD_ASK = /\b(upload|attach|send (me|it|them)|drop (it|them) (in|here))\b/i;
const cases: Case[] = (await readFile("evals/documents.jsonl", "utf8")).trim().split("\n").map((l) => JSON.parse(l));
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
  const res = await chat("eval.documents", { messages, tools: toolList });
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
      const uploadOk = !c.no_upload_ask || names.length > 0 || !UPLOAD_ASK.test(move.text);
      const hit = move.calls.find((x) => want.includes(x.name));
      const argsOk = c.args ? Boolean(hit && argsMatch(hit.args, c.args)) : null;
      rows.push({ id: c.id, run, tool_ok: toolOk && uploadOk, args_ok: argsOk, got: names.length ? move.calls.map((x) => `${x.name} ${JSON.stringify(x.args)}`) : [`(no tool) ${move.text.slice(0, 80)}`] });
    } catch (err) {
      rows.push({ id: c.id, run, tool_ok: false, args_ok: c.args ? false : null, got: [], note: err instanceof Error ? err.message : String(err) });
    }
    process.stdout.write(rows.at(-1)!.tool_ok ? "." : "x");
  }
  process.stdout.write(` run ${run}\n`);
}

// ---- Oct 28 replay: the same turn with the old SOUL.md and tool list, then today's.
const OCT28_HISTORY: Msg[] = [
  { role: "user", content: "What needs me this week?" },
  { role: "assistant", content: "Nothing is due in the next 7 days. I checked your Deadlines.\n\nTwo things need you soon:\n\n1. BCBSIL application follow-up by Wed, Nov 4.\nWhat to do: You call them or check the portal. The details are on your Deadlines page under Insurance.\n\n2. CAQH re-attestation due Fri, Nov 6.\nWhat to do: You log in and click Attest yourself. I cannot do that part for you." },
  { role: "user", content: "i am overwhelemd can you help me do them please  everything lay it out for me" },
  { role: "assistant", content: "Here is everything laid out. **1. BCBSIL follow-up - due Wed, Nov 4** Call them or check the portal. Use reference APP-1042. **2. CAQH re-attest - due Fri, Nov 6** Only you can click Attest. Needs you: upload your renewed malpractice face sheet; upload a signed W-9 for the PLLC; answer the disclosure questions; click Review and Attest." },
];
const OCT28_TURN = "can you pull up the documents here in the chat";
const oldSoul = execFileSync("git", ["show", "72288c1:aeon/SOUL.md"], { encoding: "utf8" }).trim();
const oldSystem = system.replace(/^[\s\S]*?(?=\n\n## Today)/, oldSoul);
const NEW_TOOLS = new Set(["find_documents", "open_document", "create_document"]);
const oldTools = tools.filter((t) => !NEW_TOOLS.has(t.function.name));
const replay: { side: "before" | "after"; run: number; tools: string[]; asked_upload: boolean; text: string }[] = [];
for (let run = 1; run <= RUNS; run++) {
  for (const side of ["before", "after"] as const) {
    const move = await firstMove(
      [{ role: "system", content: side === "before" ? oldSystem : system }, ...OCT28_HISTORY, { role: "user", content: OCT28_TURN }],
      side === "before" ? oldTools : tools,
    );
    replay.push({ side, run, tools: move.calls.map((c) => c.name), asked_upload: UPLOAD_ASK.test(move.text), text: move.text.slice(0, 160) });
  }
}

const scored = rows;
const toolRate = scored.filter((r) => r.tool_ok).length / scored.length;
const withArgs = scored.filter((r) => r.args_ok !== null);
const argsRate = withArgs.filter((r) => r.args_ok).length / withArgs.length;
const perCase = cases.map((c) => {
  const mine = rows.filter((r) => r.id === c.id);
  return { id: c.id, tool: `${mine.filter((r) => r.tool_ok).length}/${mine.length}`, args: c.args ? `${mine.filter((r) => r.args_ok).length}/${mine.length}` : "-", got: mine.map((r) => r.got[0] ?? r.note ?? "") };
});
const summary = {
  model: "muse-spark-1.3",
  date: today,
  runs: RUNS,
  cases: cases.length,
  tool_accuracy: Number(toolRate.toFixed(3)),
  args_accuracy: Number(argsRate.toFixed(3)),
  per_case: perCase,
  oct28_replay: replay,
};
await mkdir("evals/results", { recursive: true });
const out = path.join("evals", "results", `documents-${today}.json`);
await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\ntool choice ${(toolRate * 100).toFixed(1)}% (${scored.filter((r) => r.tool_ok).length}/${scored.length}), arguments ${(argsRate * 100).toFixed(1)}% (${withArgs.filter((r) => r.args_ok).length}/${withArgs.length})`);
for (const p of perCase) console.log(`${p.tool === `${RUNS}/${RUNS}` ? " " : "!"} ${p.id.padEnd(20)} tool ${p.tool} args ${p.args}  ${p.got[0]?.slice(0, 90)}`);
for (const r of replay) console.log(`oct28 ${r.side} run ${r.run}: tools [${r.tools.join(", ")}] upload-ask ${r.asked_upload} | ${r.text.replace(/\s+/g, " ").slice(0, 100)}`);
console.log(`saved ${out}`);
await closeDb();
