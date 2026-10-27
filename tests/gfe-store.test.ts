// Saved Good Faith Estimates against the live database (runs only when
// DATABASE_URL is set). Uses Dana's seeded [Sample] hours (Mon-Thu, closed
// federal holidays) and fees; every estimate made here is deleted afterwards.
import * as mupdf from "mupdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { WEEKDAYS } from "../lib/gfe/timing";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { approve, decline } = await import("../lib/approvals");
const { closeDb, db } = await import("../lib/db");
const store = await import("../lib/gfe/store");
const { POST: makePdf } = await import("../app/api/gfe/[id]/pdf/route");
const { practiceToday } = await import("../lib/compliance/store");

const made: { id: string; approvalId: string }[] = [];
let saved: { hours: unknown; fees: unknown } | null = null;

const THANKSGIVING_DRAFT = {
  basis: "scheduled",
  scheduled_on: "2026-11-25",
  service_on: "2026-12-15",
  service_kind: "individual",
  lines: [
    { code: "90791", quantity: 1, location: "office" },
    { code: "90837", quantity: 40, location: "either" },
  ],
  frequency: "weekly",
};

async function draft(input: unknown = THANKSGIVING_DRAFT) {
  const r = await store.draftEstimate(input, { createdBy: "test" });
  made.push({ id: r.id, approvalId: r.approvalId });
  return r;
}

beforeAll(async () => {
  if (!hasDb) return;
  const [row] = await db()`select office_hours, fee_schedule from practice_os.clinician_profile limit 1`;
  saved = { hours: row.office_hours, fees: row.fee_schedule };
});

afterAll(async () => {
  if (!hasDb) return;
  if (made.length) {
    await db()`delete from practice_os.good_faith_estimates where id in ${db()(made.map((m) => m.id))}`;
    await db()`delete from practice_os.approvals where id in ${db()(made.map((m) => m.approvalId))}`;
  }
  if (saved) {
    await db()`update practice_os.clinician_profile
                  set office_hours = ${db().json(saved.hours as never)}, fee_schedule = ${db().json(saved.fees as never)}`;
  }
  await closeDb();
});

describe.skipIf(!hasDb)("saved Good Faith Estimates", () => {
  it("the table has no column that could hold who the client is", async () => {
    const cols = await db()<{ column_name: string }[]>`
      select column_name from information_schema.columns
       where table_schema = 'practice_os' and table_name = 'good_faith_estimates'`;
    expect(cols.length).toBeGreaterThan(10);
    for (const { column_name } of cols) {
      expect(column_name).not.toMatch(/name|dob|birth|email|phone|address|street|zip|diagnos|icd|client|patient/);
    }
  });

  it("drafts with Dana's hours: Thanksgiving week, 10 open days out, due Wed Dec 2; queued, not issued", async () => {
    const r = await draft();
    expect(r.reference).toMatch(/^GFE-\d{4}-\d{4}$/);
    expect(r.dueOn).toBe("2026-12-02");
    const e = await store.getEstimate(r.id);
    expect(e).toMatchObject({ total_cents: 20_000 + 40 * 17_500, issued_on: null, approval_status: "pending" });
    expect(e?.recurring).toMatchObject({ frequency: "weekly", visits: 41 });
    expect(store.estimateStatus(e!)).toBe("Waiting for you");
  });

  it("approving marks it issued today and on time; a second approve is refused", async () => {
    const r = await draft();
    const res = await approve(r.approvalId, { by: "test" });
    expect(res.ok && res.approval.status).toBe("done");
    const e = await store.getEstimate(r.id);
    expect(e?.issued_on).toBe(await practiceToday());
    expect(e?.on_time).toBe(true);
    expect(store.estimateStatus(e!)).toBe("Issued on time");
    const again = await approve(r.approvalId, { by: "test" });
    expect(again.ok).toBe(false);
  });

  it("declining leaves it unissued", async () => {
    const r = await draft();
    await decline(r.approvalId, { by: "test" });
    const e = await store.getEstimate(r.id);
    expect(e?.issued_on).toBeNull();
    expect(store.estimateStatus(e!)).toBe("Declined");
  });

  it("refuses a service that isn't on her fee list", async () => {
    await expect(
      store.draftEstimate({ ...THANKSGIVING_DRAFT, lines: [{ code: "90847", quantity: 1, location: "office" }] }, { createdBy: "test" }),
    ).rejects.toThrow(/fee list/);
  });

  it("her office hours change the due date (Mon-Fri: Tue Dec 1)", async () => {
    const current = await store.loadPracticeSettings();
    await store.savePracticeSettings({ hours: { ...current.hours, weekdays: WEEKDAYS.weekdays }, fees: current.fees }, "test");
    const r = await draft();
    expect(r.dueOn).toBe("2026-12-01");
    await store.savePracticeSettings(current, "test");
  });

  it("the PDF carries the typed client details, and nothing stores them", async () => {
    const r = await draft();
    const marker = `Qzxtestclient${Date.now()}`;
    const req = new Request("http://localhost/api/gfe/x/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: marker,
        lastName: "Example",
        dob: "1990-01-01",
        street: "100 Sample St",
        city: "Chicago",
        state: "IL",
        zip: "60657",
        phone: "312-555-0100",
        email: "jordan@example.com",
        contactPreference: "email",
      }),
    });
    const res = await makePdf(req, { params: Promise.resolve({ id: r.id }) } as never);
    expect(res.status).toBe(200);
    const doc = mupdf.Document.openDocument(new Uint8Array(await res.arrayBuffer()), "application/pdf");
    let text = "";
    for (let i = 0; i < doc.countPages(); i++) text += doc.loadPage(i).toStructuredText("preserve-whitespace").asText();
    expect(text).toContain(marker);
    expect(text).toContain(r.reference);
    expect(text).toContain("DRAFT"); // not approved yet

    const [hits] = await db()`
      select
        (select count(*) from practice_os.good_faith_estimates e where e::text like ${"%" + marker + "%"})::int as estimates,
        (select count(*) from practice_os.approvals a where a::text like ${"%" + marker + "%"})::int as approvals,
        (select count(*) from practice_os.audit_log l where l.details::text like ${"%" + marker + "%"})::int as audit`;
    expect(hits).toEqual({ estimates: 0, approvals: 0, audit: 0 });
  });

  it("a bad PDF request names the fields, never echoes what was typed", async () => {
    const r = await draft();
    const req = new Request("http://localhost/api/gfe/x/pdf", {
      method: "POST",
      body: JSON.stringify({ firstName: "Secretname", lastName: "", dob: "nope" }),
    });
    const res = await makePdf(req, { params: Promise.resolve({ id: r.id }) } as never);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).not.toContain("Secretname");
    expect(body).toContain("dob");
  });
});

describe("priceDraft (no database)", () => {
  const fees = [{ code: "90837", label: "Therapy", cents: 17_500 }];
  it("refuses a first visit more than 12 months out for recurring care", () => {
    expect(() =>
      store.priceDraft(
        { basis: "scheduled", scheduled_on: "2026-10-27", service_on: "2027-11-30", service_kind: "individual", lines: [{ code: "90837", quantity: 1, location: "office" }], frequency: "weekly" },
        fees,
        WEEKDAYS,
        "2026-10-27",
      ),
    ).toThrow(/12 months/);
  });
});
