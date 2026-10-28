// Aeon's reflection pass. Part 1 scores the sample conversations through the
// rulebook (offline, no model, no database). Part 2 runs the whole pass against
// the live database with Muse's reply replayed (skipped without DATABASE_URL or
// the name-finder model). Everything part 2 saves is deleted after; its audit
// rows stay (append-only) and hold no text.
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { parseOps, planOps } from "../lib/aeon/memory-ops";
import { NER_MODEL, modelCacheDir } from "../lib/aeon/phi-classifier";
import { memoriesBlock, needsTidy, transcriptBlock } from "../lib/aeon/reflect";
import { CLIENT_TRAPS, REFLECT_CASES } from "./fixtures/reflect-cases";

describe("reflection rulebook: sample conversations", () => {
  let expected = 0;
  let found = 0;
  let wrong = 0;

  it.each(REFLECT_CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const { ops } = parseOps(c.proposal);
    const plan = planOps({ ops, memories: c.memories, clinicianMessages: c.said });
    const saved = plan.apply.flatMap((p) => ("text" in p ? [p.text] : []));
    const retired = plan.apply.flatMap((p) => (p.op === "retire" ? [p.id] : []));
    expect(saved).toEqual(c.keep);
    expect(retired).toEqual(c.retire ?? []);
    expect(plan.dropped.map((d) => d.reason)).toEqual(c.dropped ?? []);
    expected += c.keep.length;
    found += saved.filter((s) => c.keep.includes(s)).length;
    wrong += saved.filter((s) => !c.keep.includes(s)).length;
  });

  it("scores full recall with nothing extra saved", () => {
    expect(found).toBe(expected);
    expect(wrong).toBe(0);
  });
});

describe("reflection prompt", () => {
  it("shows notes by ref with the character usage, never their ids", () => {
    const block = memoriesBlock([{ id: "11111111-aaaa", kind: "fact", text: "Fee for 90837 is $175.", topic: null }], 8000);
    expect(block).toContain("(22 / 8,000 characters)");
    expect(block).toContain('"ref": "m1"');
    expect(block).not.toContain("11111111-aaaa");
  });

  it("marks earlier messages as context and keeps the newest when cutting", () => {
    const block = transcriptBlock([{ id: 1, role: "clinician", content: "old" }], [{ id: 2, role: "aeon", content: "new" }]);
    expect(block).toContain('"earlier_context"');
    expect(block).toMatch(/"from": "aeon"/);
  });

  it("only calls the tidy-up when notes look alike or memory is nearly full", () => {
    const a = { id: "a", kind: "fact" as const, text: "Fee for 90837 is $175.", topic: null };
    const b = { id: "b", kind: "fact" as const, text: "Does not take Medicaid.", topic: null };
    expect(needsTidy([a, b])).toBe(false);
    expect(needsTidy([a, { ...b, text: "The 90837 fee is $175." }])).toBe(true);
    expect(needsTidy([a, b], 50)).toBe(true);
  });
});

// ---- part 2: the live database ------------------------------------------------

loadEnv();
const ready = Boolean(process.env.DATABASE_URL) && existsSync(path.join(modelCacheDir(), NER_MODEL));

const madeConversations: string[] = [];

/** Replays one recorded model reply carrying a propose_memory_ops call. */
function replay(args: unknown) {
  let calls = 0;
  const fn = async () => {
    calls++;
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{ id: `call_${calls}`, type: "function", function: { name: "propose_memory_ops", arguments: JSON.stringify(args) } }],
          },
        },
      ],
    };
  };
  return Object.assign(fn, { calls: () => calls }) as unknown as NonNullable<Parameters<typeof import("../lib/aeon/reflect").reflectConversation>[1]>["chat"] & { calls: () => number };
}

describe.skipIf(!ready)("reflection pass (live database)", async () => {
  const { db, closeDb } = await import("../lib/db");
  const { reflectConversation } = await import("../lib/aeon/reflect");
  const tag = `r${Date.now().toString(36)}`;

  async function conversation(said: string[]): Promise<string> {
    const [row] = await db()<{ id: string }[]>`insert into practice_os.conversations (title, is_sample) values (${`test ${tag}`}, true) returning id`;
    madeConversations.push(row.id);
    for (const text of said) {
      await db()`insert into practice_os.chat_messages (conversation_id, role, content) values (${row.id}, 'clinician', ${text})`;
      await db()`insert into practice_os.chat_messages (conversation_id, role, content) values (${row.id}, 'aeon', 'Noted.')`;
    }
    return row.id;
  }

  afterAll(async () => {
    const ids = madeConversations.length ? madeConversations : ["00000000-0000-0000-0000-000000000000"];
    await db()`delete from practice_os.memories where source = any(${ids.map((id) => `reflect:${id}`)})`;
    await db()`delete from practice_os.conversations where id in ${db()(ids)}`;
    await closeDb();
  });

  it("saves a practice fact, audits ids and counts only, and moves the marker once", async () => {
    const said = [`[Sample] My ${tag} parking validation costs $12 per visit.`];
    const id = await conversation(said);
    const text = `[Sample] Parking validation (${tag}) costs $12 per visit.`;
    const chat = replay({ ops: [{ op: "ADD", kind: "fact", topic: "admin_compliance", text, evidence: `${tag} parking validation costs $12 per visit`, reason: "" }] });

    const first = await reflectConversation(id, { chat });
    expect(first.status).toBe("done");
    if (first.status === "done") expect(first.counts.added).toBe(1);

    const [saved] = await db()<{ id: string; topic: string }[]>`select id, topic from practice_os.memories where text = ${text}`;
    expect(saved.topic).toBe("admin_compliance");
    const audits = await db()<{ action: string; details: unknown }[]>`
      select action, details from practice_os.audit_log
      where subject_id = ${saved.id} or (action = 'memory_reflection' and subject_id = ${id})`;
    expect(audits.map((a) => a.action).sort()).toEqual(["memory_reflection", "memory_saved"]);
    expect(JSON.stringify(audits)).not.toContain(tag);

    // Same conversation again: nothing new, no model call, no second row.
    const again = await reflectConversation(id, { chat });
    expect(again.status).toBe("nothing_new");
    expect(chat.calls()).toBe(1);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.memories where text = ${text}`;
    expect(n).toBe(1);
  });

  it("refuses all 20 client-detail traps, even when her message slipped past the guard", async () => {
    const id = await conversation(CLIENT_TRAPS.map((t) => t.text));
    const ops = CLIENT_TRAPS.map((t) => ({ op: "ADD", kind: "fact", topic: "schedule", text: t.text, evidence: t.text, reason: "" }));
    const result = await reflectConversation(id, { chat: replay({ ops }) });
    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    const refusedOrDropped = result.counts.refused + result.dropped.length;
    const leaked = await db()<{ text: string }[]>`select text from practice_os.memories where source = ${`reflect:${id}`}`;
    expect(leaked.map((l) => l.text)).toEqual([]);
    expect(result.counts.added).toBe(0);
    expect(refusedOrDropped).toBe(CLIENT_TRAPS.length);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.memories where source = ${`reflect:${id}`}`;
    expect(n).toBe(0);
    const refusals = await db()<{ details: unknown }[]>`
      select details from practice_os.audit_log where action = 'memory_refused' and details->>'source' = ${`reflect:${id}`}`;
    for (const t of CLIENT_TRAPS) expect(JSON.stringify(refusals)).not.toContain(t.text.slice(0, 20));
  }, 60_000);

  it("leaves the marker alone when Muse never calls the tool, so the next pass retries", async () => {
    const id = await conversation([`[Sample] ${tag} superbills go out on the 1st of each month.`]);
    let calls = 0;
    const silent = async () => {
      calls++;
      return { choices: [{ message: { role: "assistant", content: "Nothing to save." } }] };
    };
    expect((await reflectConversation(id, { chat: silent as never })).status).toBe("no_reply");
    expect(calls).toBe(2); // one reminder, then it gives up for now
    const [row] = await db()<{ reflected_through: string }[]>`select reflected_through from practice_os.conversations where id = ${id}`;
    expect(Number(row.reflected_through)).toBe(0);
  });

  it("reads a long backlog over several passes instead of skipping it", async () => {
    const long = (n: number) => `[Sample] ${tag} note ${n}: ${"admin detail ".repeat(530)}`; // ~7,000 chars each
    const id = await conversation([long(1), long(2), long(3), long(4)]);
    const chat = replay({ ops: [{ op: "NOOP", reason: "" }] });
    const marker = async () =>
      Number((await db()<{ r: string }[]>`select reflected_through as r from practice_os.conversations where id = ${id}`)[0].r);
    await reflectConversation(id, { chat });
    const afterFirst = await marker();
    const [{ last }] = await db()<{ last: number }[]>`select max(id)::int as last from practice_os.chat_messages where conversation_id = ${id}`;
    expect(afterFirst).toBeGreaterThan(0);
    expect(afterFirst).toBeLessThan(last);
    for (let i = 0; i < 5 && (await marker()) < last; i++) await reflectConversation(id, { chat });
    expect(await marker()).toBe(last);
  });

  it("a demo visitor's chat is marked reflected and never read", async () => {
    const { sendMessage } = await import("../lib/aeon/chat");
    const fakeChat = async () => ({ choices: [{ message: { role: "assistant", content: "[Sample] Sure." } }] });
    const { conversationId } = await sendMessage({ text: `[Sample] I like ${tag} reminders on Mondays.`, viewOnly: true, chat: fakeChat as never });
    expect(conversationId).toBeTruthy();
    madeConversations.push(conversationId!);
    const chat = replay({ ops: [{ op: "NOOP", reason: "" }] });
    expect((await reflectConversation(conversationId!, { chat })).status).toBe("nothing_new");
    expect(chat.calls()).toBe(0);
  });
});
