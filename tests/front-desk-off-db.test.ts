import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { FRONT_DESK_ENABLED } from "../lib/features";

// Front Desk is paused (lib/features.ts): what the database sees. Runs only with a database,
// and only while the switch is off.
loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { approve, decline, listApprovals, listApprovalsById, queueApproval } = await import("../lib/approvals");
const { closeDb, db } = await import("../lib/db");
const { loadMenuData } = await import("../lib/ui/menu");
const { loadNeeds } = await import("../lib/admin/load");
const { alertCrisis } = await import("../lib/safety");

const created: string[] = [];
async function make(kind: string) {
  const [row] = await db()`
    insert into practice_os.approvals (kind, title, preview, payload, created_by)
    values (${kind}, 'vitest front desk off', '{}'::jsonb, '{}'::jsonb, 'test')
    returning id`;
  created.push(row.id);
  return row.id as string;
}

afterAll(async () => {
  if (!hasDb) return;
  if (created.length) await db()`delete from practice_os.approvals where id in ${db()(created)}`;
  await closeDb();
});

describe.skipIf(FRONT_DESK_ENABLED || !hasDb)("Front Desk is off (database)", () => {
  it("hides its approvals from lists and the menu count, without deleting them", async () => {
    const normal = await make("test_note");
    const withNormal = (await loadMenuData()).counts.approvals;
    const fd = await make("text_consult_options");
    const listed = (await listApprovals({ includeDecided: true, limit: 500 })).map((a) => a.id);
    expect(listed).toContain(normal);
    expect(listed).not.toContain(fd);
    expect((await loadMenuData()).counts.approvals).toBe(withNormal); // the Front Desk one adds nothing
    const [row] = await db()`select status from practice_os.approvals where id = ${fd}`;
    expect(row.status).toBe("pending"); // still there, untouched
  });

  it("refuses to approve, decline, show by id or queue a Front Desk approval", async () => {
    const fd = await make("sms_reply");
    expect(await approve(fd, { by: "test" })).toEqual({ ok: false, reason: "not_found" });
    expect(await decline(fd, { by: "test" })).toEqual({ ok: false, reason: "not_found" });
    expect(await listApprovalsById([fd])).toEqual([]);
    await expect(queueApproval({ kind: "web_chat_reply", title: "x", createdBy: "test" })).rejects.toThrow(/paused/);
    const [row] = await db()`select status from practice_os.approvals where id = ${fd}`;
    expect(row.status).toBe("pending");
  });

  it("with no phone line, a crisis in chat shows an urgent item at the top of Admin's list", async () => {
    await db()`update practice_os.settings set alert_phone = null`;
    const saved = process.env.CLINICIAN_ALERT_PHONE;
    delete process.env.CLINICIAN_ALERT_PHONE;
    try {
      expect(await alertCrisis({ source: "chat", category: "self_harm", by: "chat:test" })).toEqual({ alerted: false });
    } finally {
      if (saved !== undefined) process.env.CLINICIAN_ALERT_PHONE = saved;
    }
    const needs = await loadNeeds();
    expect(needs[0]).toMatchObject({ kind: "urgent_alert", tier: 1 });
    expect(needs[0].title).toMatch(/988/);
    expect((await loadMenuData()).counts.admin).toBeGreaterThan(0);
  });

  it("with phone alerts off, texts no one even when an alert cell is saved", async () => {
    await db()`update practice_os.settings set alert_phone = '+13125550142'`;
    try {
      expect(await alertCrisis({ source: "chat", category: "self_harm", by: "chat:test" })).toEqual({ alerted: false });
      const [last] = await db()`select action, details from practice_os.audit_log where actor = 'safety' order by id desc limit 1`;
      expect(last).toMatchObject({ action: "crisis_alert_failed", details: { error: "phone alerts are off" } });
      expect((await loadNeeds())[0]).toMatchObject({ kind: "urgent_alert", title: "Aeon showed the 988 message in your chat", action: { label: "Open chat", href: "/" } });
    } finally {
      await db()`update practice_os.settings set alert_phone = null`;
    }
  });

  it("the server start-up does not start the poller while paused", () => {
    const source = readFileSync("instrumentation.ts", "utf8");
    expect(source).toMatch(/FRONT_DESK_ENABLED && !process\.env\.VERCEL/);
  });
});
