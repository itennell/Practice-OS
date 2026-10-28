// Approve flow against the live database. Runs only when DATABASE_URL is set.
// Each test creates its own approval (created_by 'test') and deletes it after.
// The audit rows it writes stay, because audit_log is append-only.
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { approve, decline } = await import("../lib/approvals");
const { closeDb, db } = await import("../lib/db");

const created: string[] = [];

async function makeApproval(kind: string, payload: Record<string, unknown>) {
  const [row] = await db()`
    insert into practice_os.approvals (kind, title, preview, payload, created_by)
    values (${kind}, 'vitest approval', ${db().json(payload as never)}, ${db().json(payload as never)}, 'test')
    returning id`;
  created.push(row.id);
  return row.id as string;
}

async function auditActions(id: string) {
  const rows = await db()`select action, details from practice_os.audit_log where approval_id = ${id} order by id`;
  return rows;
}

afterAll(async () => {
  if (!hasDb) return;
  if (created.length) await db()`delete from practice_os.approvals where id in ${db()(created)}`;
  await closeDb();
});

describe.skipIf(!hasDb)("approve flow", () => {
  it("approves a test note: done, with a result and audit rows", async () => {
    const id = await makeApproval("test_note", { note: "hello" });
    const res = await approve(id, { by: "test" });
    expect(res.ok && res.approval.status).toBe("done");
    expect(res.ok && res.approval.result).toMatchObject({ wrote: "audit_log", note: "hello" });
    const actions = (await auditActions(id)).map((r) => r.action);
    expect(actions).toEqual(["approval_approved", "test_note_written", "approval_done"]);
  });

  it("fails a test note marked fail, keeping the error", async () => {
    const id = await makeApproval("test_note", { note: "boom", fail: true });
    const res = await approve(id, { by: "test" });
    expect(res.ok && res.approval.status).toBe("failed");
    expect(res.ok && res.approval.error).toMatch(/Test failure requested/);
    expect((await auditActions(id)).map((r) => r.action)).toEqual(["approval_approved", "approval_failed"]);
  });

  it("fails a kind with no executor yet", async () => {
    const id = await makeApproval("web_chat_reply", {});
    const res = await approve(id, { by: "test" });
    expect(res.ok && res.approval.status).toBe("failed");
    expect(res.ok && res.approval.error).toBe("No executor for web_chat_reply yet.");
  });

  it("edit then approve runs the edited text and logs before and after", async () => {
    const id = await makeApproval("test_note", { note: "original" });
    const res = await approve(id, { by: "test", edit: "edited" });
    expect(res.ok && res.approval.result).toMatchObject({ note: "edited" });
    const [first] = await auditActions(id);
    expect(first.action).toBe("approval_edited_and_approved");
    expect(first.details).toMatchObject({ before: { note: "original" }, after: { note: "edited" } });
  });

  it("refuses an empty edit and leaves the approval pending", async () => {
    const id = await makeApproval("test_note", { note: "x" });
    const res = await approve(id, { by: "test", edit: "   " });
    expect(res).toMatchObject({ ok: false, reason: "bad_edit" });
    const [row] = await db()`select status from practice_os.approvals where id = ${id}`;
    expect(row.status).toBe("pending");
  });

  it("declines: rejected, audited, and can't be approved afterwards", async () => {
    const id = await makeApproval("test_note", { note: "no" });
    const res = await decline(id, { by: "test" });
    expect(res.ok && res.approval.status).toBe("rejected");
    expect((await auditActions(id)).map((r) => r.action)).toEqual(["approval_declined"]);
    expect(await approve(id, { by: "test" })).toMatchObject({ ok: false, reason: "not_pending" });
  });

  it("runs the executor only once when Approve is clicked twice at the same moment", async () => {
    const id = await makeApproval("test_note", { note: "twice" });
    const results = await Promise.all([approve(id, { by: "test" }), approve(id, { by: "test" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const written = (await auditActions(id)).filter((r) => r.action === "test_note_written");
    expect(written).toHaveLength(1);
  });
});
