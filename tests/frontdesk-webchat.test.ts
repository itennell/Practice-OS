// The practice website chat: AI disclosure first, crisis check before any
// model, consult times only after her approval, fixed wording throughout.
// Writes inquiries, messages and approvals, so it runs only on a local throwaway database.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const url = process.env.DATABASE_URL ?? "";
const localDb = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

// The local name-finder is tested on its own (guard.test.ts); here it finds nothing.
vi.mock("../lib/aeon/phi-classifier", async (orig) => ({ ...(await orig<object>()), findNames: async () => [] }));

const { db, closeDb } = await import("../lib/db");
const { setFrontDeskDeps } = await import("../lib/frontdesk/deps");
const { webChatMessage, webChatThread, WebChatError, MAX_CHARS } = await import("../lib/frontdesk/webchat");
const { approve } = await import("../lib/approvals");
const { CRISIS_REPLY } = await import("../lib/safety");

const NOW = new Date("2026-11-02T16:00:00Z");
const made: string[] = [];
const sent: string[] = [];
const phone = {
  vendor: "twilio" as const,
  check: async () => ({ ok: true as const, label: "fake" }),
  listVoicemails: async () => [],
  listInboundTexts: async () => [],
  sendText: async (to: string) => {
    sent.push(to);
    return { id: `SM_web_${sent.length}_${Date.now()}` };
  },
};
const saved = { DRY_RUN: process.env.DRY_RUN, CLINICIAN_ALERT_PHONE: process.env.CLINICIAN_ALERT_PHONE };

beforeAll(() => {
  if (!localDb) return;
  process.env.DRY_RUN = "false"; // safe: the phone is a fake that only records
  process.env.CLINICIAN_ALERT_PHONE = "+13125550199";
  setFrontDeskDeps({ phone: async () => phone, calendar: async () => null, timeZone: async () => "America/Chicago", now: () => NOW });
});

afterAll(async () => {
  if (!localDb) return;
  setFrontDeskDeps(null);
  if (made.length) {
    await db()`delete from practice_os.approvals where payload ->> 'inquiry_id' in ${db()(made)}`;
    await db()`delete from practice_os.alerts where inquiry_id in ${db()(made)}`;
    await db()`delete from practice_os.inquiries where id in ${db()(made)}`;
  }
  for (const k of ["DRY_RUN", "CLINICIAN_ALERT_PHONE"] as const) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await closeDb();
});

const send = async (conversation: string | null, text: string) => {
  const out = await webChatMessage({ conversation, text });
  if (!made.includes(out.conversation)) made.push(out.conversation);
  return out;
};

describe.skipIf(!localDb)("website chat (local database only)", () => {
  it("says it is an AI assistant first, then books by approval only", async () => {
    const { conversation, lines } = await send(null, "Hi, I'd like to book a consult");
    expect(lines[0]).toMatchObject({ from: "assistant" });
    expect(lines[0].text).toMatch(/^Hi, I'm the AI assistant for /);
    expect(lines[1]).toMatchObject({ from: "visitor", text: "Hi, I'd like to book a consult" });
    expect(lines[2].text).toMatch(/checks them first/);
    expect(lines).toHaveLength(3);

    const [appr] = await db()`select id, kind, status, payload from practice_os.approvals where payload ->> 'inquiry_id' = ${conversation}`;
    expect(appr).toMatchObject({ kind: "web_chat_reply", status: "pending" });
    expect(appr.payload.body).toMatch(/^Open consult times with .*: 1\) Tue 10am 2\) Wed 2pm 3\) Thu 4pm\./);

    await approve(appr.id, { by: "test" });
    const thread = (await webChatThread(conversation))!;
    expect(thread.at(-1)).toMatchObject({ from: "assistant", text: appr.payload.body });

    const after = await send(conversation, "2 please, my number is 312-555-0170");
    expect(after.lines.at(-1)!.text).toMatch(/will confirm the time/);
    const [inq] = await db()`select contact_phone, status from practice_os.inquiries where id = ${conversation}`;
    expect(inq).toEqual({ contact_phone: "+13125550170", status: "needs_clinician" });
    const [alert] = await db()`select kind, message from practice_os.alerts where inquiry_id = ${conversation}`;
    expect(alert).toMatchObject({ kind: "question", message: "A website visitor picked consult time 2. Confirm it with them (they left contact details)." });
    expect(sent).toHaveLength(0); // nothing was texted to the visitor
  });

  it("a crisis message gets the fixed 988 reply and alerts her, before any model", async () => {
    const [{ n: before }] = await db()`select count(*)::int as n from practice_os.model_calls`;
    const { conversation, lines } = await send(null, "I want to end my life");
    expect(lines.at(-1)).toMatchObject({ from: "assistant", text: CRISIS_REPLY });
    const [{ n: after }] = await db()`select count(*)::int as n from practice_os.model_calls`;
    expect(after).toBe(before);
    const [inq] = await db()`select crisis_flag from practice_os.inquiries where id = ${conversation}`;
    expect(inq.crisis_flag).toBe(true);
    expect(sent).toEqual(["+13125550199"]); // her alert only
    const [{ n: approvals }] = await db()`select count(*)::int as n from practice_os.approvals where payload ->> 'inquiry_id' = ${conversation}`;
    expect(approvals).toBe(0);
    const [msg] = await db()`select meta from practice_os.messages where inquiry_id = ${conversation} and direction = 'inbound'`;
    expect(msg.meta.safety.crisis).toBe("self_harm");
  });

  it("a question goes to her; the visitor gets the fixed passed-on line", async () => {
    const { conversation, lines } = await send(null, "Do you take Blue Cross insurance?");
    expect(lines.at(-1)!.text).toMatch(/^I've passed your message to /);
    const [alert] = await db()`select kind from practice_os.alerts where inquiry_id = ${conversation}`;
    expect(alert.kind).toBe("question");
  });

  it("refuses empty and over-long messages, and unknown conversations start fresh", async () => {
    await expect(webChatMessage({ conversation: null, text: "  " })).rejects.toBeInstanceOf(WebChatError);
    await expect(webChatMessage({ conversation: null, text: "x".repeat(MAX_CHARS + 1) })).rejects.toBeInstanceOf(WebChatError);
    expect(await webChatThread("not-a-uuid")).toBeNull();
    const { conversation } = await send("00000000-0000-4000-8000-000000000000", "hello");
    expect(conversation).not.toBe("00000000-0000-4000-8000-000000000000");
  });
});
