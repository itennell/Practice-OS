// Insurance submission safety: chat wording can never mark an application
// sent. Only her own change on the Insurance page records Applied, Pending
// or Follow up, and the date she applied.
import { afterAll, describe, expect, it, vi } from "vitest";
// The PHI name finder is a local model; these checks are about what gets saved, not what it reads.
vi.mock("../lib/aeon/guard", () => ({ guard: vi.fn(async (t: string) => ({ ok: true, text: t })), REFUSAL: {} }));
import { z } from "zod";
import { loadEnv } from "../lib/env";
import { TOOLS_BY_NAME, runTool } from "../lib/aeon/tools";
import { CHAT_SET_STATUSES, STATUSES, WAITING } from "../lib/payers/store";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const tool = TOOLS_BY_NAME.get("update_payer_application")!;
const parse = (status: string) => z.object(tool.input).safeParse({ payer: "BCBSIL", status });

describe("update_payer_application can never record a sent application", () => {
  it("leaves out exactly the waiting statuses: applied, pending, follow_up", () => {
    expect(tool).toBeDefined();
    expect([...CHAT_SET_STATUSES, ...WAITING].sort()).toEqual([...STATUSES].sort());
  });

  it("rejects every waiting status, accepts the rest", () => {
    for (const status of WAITING) expect(parse(status).success, status).toBe(false);
    for (const status of CHAT_SET_STATUSES) expect(parse(status).success, status).toBe(true);
  });

  it("has no applied_on or follow_up_on input", () => {
    expect(Object.keys(tool.input)).not.toContain("applied_on");
    expect(Object.keys(tool.input)).not.toContain("follow_up_on");
  });

  it("no longer teaches the sent-my-words example", () => {
    expect(tool.description).not.toContain("I sent my");
    expect(tool.description).toContain("only from her own change");
  });
});

describe.skipIf(!hasDb)("update_payer_application through runTool", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { savePayerApplication } = await import("../lib/payers/store");
  const made: string[] = [];
  afterAll(async () => {
    if (made.length) await db()`delete from practice_os.payer_applications where id in ${db()(made)}`;
    await closeDb();
  });

  const row = async (id: string) => {
    const [r] = await db()<{ status: string; applied_on: Date | null; follow_up_on: Date | null }[]>`
      select status, applied_on, follow_up_on from practice_os.payer_applications where id = ${id}`;
    return r;
  };
  const fresh = async () => {
    const a = await savePayerApplication({ payer: `Vitest Safety ${made.length}`, status: "preparing" }, "clinician");
    made.push(a.id);
    return a;
  };

  for (const status of ["pending", "follow_up", "applied"]) {
    it(`{status: "${status}"} writes nothing and points her to the Insurance page`, async () => {
      const a = await fresh();
      const r = await runTool("update_payer_application", { id: a.id, payer: a.payer, status }, { by: "chat:test" });
      expect(r.content[0].text).toContain("/admin?panel=insurance");
      expect(await row(a.id)).toMatchObject({ status: "preparing", applied_on: null, follow_up_on: null });
    });
  }

  it('{applied_on: "2026-11-01"} is dropped: no applied or follow-up date, status unchanged', async () => {
    const a = await fresh();
    const r = await runTool("update_payer_application", { id: a.id, payer: a.payer, status: "preparing", applied_on: "2026-11-01" }, { by: "chat:test" });
    expect(r.isError).toBeFalsy();
    expect(await row(a.id)).toMatchObject({ status: "preparing", applied_on: null, follow_up_on: null });
  });

  it("approving from chat keeps the applied date she saved herself", async () => {
    const a = await fresh();
    await savePayerApplication({ id: a.id, payer: a.payer, status: "applied", applied_on: "2026-10-01" }, "clinician");
    await runTool("update_payer_application", { id: a.id, payer: a.payer, status: "approved" }, { by: "chat:test" });
    const r = await row(a.id);
    expect(r.status).toBe("approved");
    expect(r.applied_on?.toISOString().slice(0, 10)).toBe("2026-10-01");
  });
});
