// The practice website chat: AI disclosure first, crisis check before any
// model, consult times only after her approval, fixed wording throughout.
// Writes inquiries, messages and approvals, so it runs only on a local throwaway database.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const url = process.env.DATABASE_URL ?? "";
const localDb = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

// The local name-finder is tested on its own (guard.test.ts); here it finds nothing.
vi.mock("../lib/aeon/phi-classifier", async (orig) => ({ ...(await orig<object>()), findNames: async () => [] }));
// No model in these tests: every Muse call fails, so the keyword fallback answers; the count shows who called it.
const museCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock("../lib/meta", async (orig) => ({
  ...(await orig<object>()),
  chat: async () => {
    museCalls.n++;
    throw new Error("no model in tests");
  },
}));

const { db, closeDb } = await import("../lib/db");
const { setFrontDeskDeps } = await import("../lib/frontdesk/deps");
const { webChatMessage, webChatThread, purgeExpiredWebChats, WebChatError, MAX_CHARS, CRISIS_ALERTS_PER_IP_PER_HOUR } = await import(
  "../lib/frontdesk/webchat"
);
const { alertPhone } = await import("../lib/frontdesk/crisis");
const { resetWebChatRateLimit } = await import("../lib/frontdesk/webchat-rate-limit");
const { sampleCalendar } = await import("../lib/frontdesk/test-console");
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
  setFrontDeskDeps({
    phone: async () => phone,
    calendar: async () => sampleCalendar(NOW, "America/Chicago"),
    timeZone: async () => "America/Chicago",
    now: () => NOW,
  });
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

beforeEach(() => resetWebChatRateLimit());

const send = async (conversation: string | null, text: string, ip?: string) => {
  const out = await webChatMessage({ conversation, text, ip });
  if (!out.conversation) throw new Error("expected a saved chat");
  if (!made.includes(out.conversation)) made.push(out.conversation);
  return { conversation: out.conversation, lines: out.lines };
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
    sent.length = 0;
    const before = museCalls.n;
    const { conversation, lines } = await send(null, "I want to end my life");
    expect(lines.at(-1)).toMatchObject({ from: "assistant", text: CRISIS_REPLY });
    expect(museCalls.n).toBe(before);
    const [inq] = await db()`select crisis_flag from practice_os.inquiries where id = ${conversation}`;
    expect(inq.crisis_flag).toBe(true);
    // Her alert only, to whichever verified phone is set (settings.alert_phone, else CLINICIAN_ALERT_PHONE).
    expect(sent).toEqual([await alertPhone()]);
    const [{ n: approvals }] = await db()`select count(*)::int as n from practice_os.approvals where payload ->> 'inquiry_id' = ${conversation}`;
    expect(approvals).toBe(0);
    const [msg] = await db()`select body, meta from practice_os.messages where inquiry_id = ${conversation} and direction = 'inbound'`;
    expect(msg.body).toBe("[Message withheld after the safety check]");
    expect(msg.body).not.toContain("end my life");
    expect(msg.meta.safety.crisis).toBe("self_harm");
  });

  it("runs the crisis check before the length and 40-message limits", async () => {
    const first = await send(null, "A practice-hours question");
    await db()`
      insert into practice_os.messages (inquiry_id, direction, channel, body, vendor, provider_sid)
      select ${first.conversation}, 'inbound', 'web_chat', 'ordinary message', 'web', null
      from generate_series(1, 40)`;
    const out = await send(first.conversation, `${"x".repeat(MAX_CHARS + 20)} I wish I was dead`);
    expect(out.lines.at(-1)?.text).toBe(CRISIS_REPLY);
    const [stored] = await db()`
      select body, meta from practice_os.messages
      where inquiry_id = ${first.conversation} and direction = 'inbound'
      order by created_at desc, id desc limit 1`;
    expect(stored.body).toBe("[Message withheld after the safety check]");
    expect(stored.meta.safety).toEqual({ crisis: "self_harm" });
  });

  it("uses only a real connected calendar and catches calendar failures", async () => {
    for (const mode of ["missing", "throws"] as const) {
      const adapter = mode === "missing" ? null : sampleCalendar(NOW, "America/Chicago");
      if (adapter) adapter.openSlots = async () => {
        throw new Error("calendar unavailable");
      };
      setFrontDeskDeps({ phone: async () => phone, calendar: async () => adapter, timeZone: async () => "America/Chicago", now: () => NOW });
      const out = await send(null, "I'd like to book a consult");
      expect(out.lines.at(-1)?.text).toMatch(/can't check the calendar right now/i);
      const [{ n }] = await db()`select count(*)::int as n from practice_os.approvals where payload ->> 'inquiry_id' = ${out.conversation}`;
      expect(n).toBe(0);
    }
    setFrontDeskDeps({ phone: async () => phone, calendar: async () => sampleCalendar(NOW, "America/Chicago"), timeZone: async () => "America/Chicago", now: () => NOW });
  });

  it("keeps only one pending consult-times approval", async () => {
    const first = await send(null, "Please show me consult times");
    await send(first.conversation, "I still want to book a consult");
    const [{ n }] = await db()`
      select count(*)::int as n from practice_os.approvals
      where kind = 'web_chat_reply' and status = 'pending' and payload ->> 'inquiry_id' = ${first.conversation}`;
    expect(n).toBe(1);
  });

  it("purges public chats and pending replies after 30 days", async () => {
    const old = await send(null, "Please show me consult times");
    const expiredAt = new Date(NOW.getTime() - 31 * 86_400_000);
    await db()`update practice_os.inquiries set created_at = ${expiredAt} where id = ${old.conversation}`;
    await db()`update practice_os.messages set created_at = ${expiredAt} where inquiry_id = ${old.conversation}`;
    expect(await purgeExpiredWebChats(NOW)).toBeGreaterThanOrEqual(1);
    expect(await webChatThread(old.conversation)).toBeNull();
    const [{ n }] = await db()`select count(*)::int as n from practice_os.approvals where payload ->> 'inquiry_id' = ${old.conversation}`;
    expect(n).toBe(0);
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

  it("a flood of crisis posts gets 50 fixed replies but only a few texts to her", async () => {
    sent.length = 0;
    const ip = "203.0.113.50";
    const chats = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const out = await webChatMessage({ conversation: null, text: `I want to kill myself ${i}`, ip });
      expect(out.lines.at(-1)).toMatchObject({ from: "assistant", text: CRISIS_REPLY });
      if (out.conversation) chats.add(out.conversation);
    }
    made.push(...chats);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThanOrEqual(CRISIS_ALERTS_PER_IP_PER_HOUR);
    expect(chats.size).toBeLessThanOrEqual(3); // new chats per visitor per hour
    const [{ n: held }] = await db()`
      select count(*)::int as n from practice_os.audit_log
      where action = 'crisis_alert_suppressed' and details ->> 'channel' = 'web_chat' and at > now() - interval '1 minute'`;
    expect(held).toBeGreaterThanOrEqual(50 - sent.length);
  });

  it("a crisis flood in one chat texts her once, and the next alert counts the held-back ones", async () => {
    sent.length = 0;
    const texts: string[] = [];
    const recording = { ...phone, sendText: async (to: string, body: string) => (texts.push(body), phone.sendText(to)) };
    const deps = (p: typeof recording) => ({ phone: async () => p, calendar: async () => sampleCalendar(NOW, "America/Chicago"), timeZone: async () => "America/Chicago", now: () => NOW });
    setFrontDeskDeps(deps(recording));
    try {
      const first = await send(null, "A practice-hours question", "203.0.113.51");
      for (let i = 0; i < 20; i++) {
        const out = await send(first.conversation, "I wish I was dead", "203.0.113.51");
        expect(out.lines.at(-1)?.text).toBe(CRISIS_REPLY);
      }
      expect(sent).toHaveLength(1);
      // A different visitor's chat alerts again and counts the ones held back.
      await send(null, "I want to end my life", "203.0.113.52");
      expect(sent).toHaveLength(2);
      expect(texts.at(-1)).toMatch(/\d+ more website chat messages like this came in since the last alert/);
    } finally {
      setFrontDeskDeps(deps(phone));
    }
  });

  it("never sends a diagnosis or an ID number to Muse", async () => {
    const before = museCalls.n;
    const { lines } = await send(null, "My member ID: ABC12345. Do you take Blue Cross insurance?");
    expect(lines.at(-1)!.text).toMatch(/^I've passed your message to /);
    expect(museCalls.n).toBe(before);
    await send(null, "Do you take Blue Cross insurance?");
    expect(museCalls.n).toBe(before + 1); // an ordinary question does try Muse (and falls back)
  });

  it("limits one visitor per minute", async () => {
    const ip = "203.0.113.60";
    let refused: unknown = null;
    for (let i = 0; i < 13 && !refused; i++) {
      await webChatMessage({ conversation: null, text: "What are your hours?", ip }).then(
        (out) => void (out.conversation && made.push(out.conversation)),
        (e) => void (refused = e),
      );
    }
    expect(refused).toBeInstanceOf(WebChatError);
    expect((refused as InstanceType<typeof WebChatError>).status).toBe(429);
  });
});
