// npm run aeon:record: runs Aeon's golden conversations (tests/fixtures/aeon-scenarios.ts)
// live against muse-spark-1.3 and saves the model's replies to
// tests/fixtures/aeon-chat/<name>.json, so CI can replay them without a model call.
// Tools run for real against the database; everything the run creates is deleted.
// Usage: npm run aeon:record [scenario-name ...]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../lib/env";

loadEnv();
const { chat } = await import("../lib/meta");
const { sendMessage } = await import("../lib/aeon/chat");
const { remember } = await import("../lib/aeon/memory");
const { closeDb, db } = await import("../lib/db");
const { SCENARIOS } = await import("../tests/fixtures/aeon-scenarios");

const outDir = path.join(process.cwd(), "tests", "fixtures", "aeon-chat");
await mkdir(outDir, { recursive: true });
const only = process.argv.slice(2);
let failed = 0;

for (const scenario of SCENARIOS.filter((s) => only.length === 0 || only.includes(s.name))) {
  const calls: { tools: string[]; lastRole: string; response: unknown }[] = [];
  const recorder: typeof chat = async (feature, params) => {
    const response = await chat(feature, params);
    calls.push({ tools: (params.tools ?? []).map((t) => (t as { function: { name: string } }).function.name), lastRole: params.messages.at(-1)!.role, response });
    return response;
  };

  const startedAt = new Date();
  const seeded: string[] = [];
  const conversations: string[] = [];
  const replies: { text: string; tools: string[] }[] = [];
  try {
    for (const m of scenario.seedMemories ?? []) {
      seeded.push((await remember(m, { actor: "clinician", source: "test:record" })).memory.id);
    }
    for (const turns of scenario.conversations) {
      let conversationId: string | null = null;
      for (const text of turns) {
        const result = await sendMessage({ conversationId, text, chat: recorder });
        conversationId = result.conversationId;
        if (conversationId) conversations.push(conversationId);
        replies.push({ text: result.reply.text, tools: result.reply.kind === "answer" ? result.reply.steps.map((s) => s.tool) : [] });
      }
    }
  } finally {
    // Undo what the run made: its conversations, memories, approvals and estimates.
    const sql = db();
    if (conversations.length) await sql`delete from practice_os.conversations where id in ${sql(conversations)}`;
    await sql`delete from practice_os.posts where created_at >= ${startedAt} and status = 'idea'`;
    await sql`delete from practice_os.memories where created_at >= ${startedAt} and (source like 'chat:%' or source = 'test:record')`;
    const approvals = await sql<{ id: string }[]>`
      select id from practice_os.approvals where created_at >= ${startedAt} and created_by like 'chat:%'`;
    if (approvals.length) {
      const ids = approvals.map((a) => a.id);
      await sql`delete from practice_os.good_faith_estimates where approval_id in ${sql(ids)}`;
      await sql`delete from practice_os.posts where approval_id in ${sql(ids)}`;
      await sql`delete from practice_os.approvals where id in ${sql(ids)}`;
    }
    if (seeded.length) await sql`delete from practice_os.memories where id in ${sql(seeded)}`;
  }

  const used = [...new Set(replies.flatMap((r) => r.tools))];
  const last = replies.at(-1)?.text ?? "";
  const ok =
    scenario.expectTools.every((t) => used.includes(t)) &&
    !(scenario.forbidTools ?? []).some((t) => used.includes(t)) &&
    scenario.expectReply.test(last);
  if (!ok) failed++;
  await writeFile(path.join(outDir, `${scenario.name}.json`), `${JSON.stringify({ scenario: scenario.name, recordedAt: startedAt.toISOString(), calls, replies }, null, 2)}\n`);
  console.log(`${ok ? "PASS" : "FAIL"} ${scenario.name}: tools [${used.join(", ")}] reply: ${last.replace(/\s+/g, " ").slice(0, 140)}`);
}

await closeDb();
process.exit(failed ? 1 : 0);
