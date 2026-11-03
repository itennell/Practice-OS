// Referral nurture against the database: "I referred someone to them" keeps a
// date and a count and nothing else (the database refuses a note), her notes
// about the people she refers to go through the privacy guard, the weekly plan
// adds at most 2 going-cold nudges, and over MCP log_referral_out waits for her
// approval. It writes and deletes rows, so it runs ONLY against the built-in
// throwaway database on this computer (like tests/demo-reset.test.ts), never a
// shared one named in .env. Fake data only; the privacy guard is a pass-through
// unless a test passes its own check.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: vi.fn(async (t: string) => ({ ok: true, text: t })) }));

import { loadEnv } from "../lib/env";
import { projectRefOf } from "../lib/demo-reset";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const { contactsFor, logContact } = await import("../lib/referrals/contacts");
const { logReferralOut, referOutNotesFor, saveReferOutNotes } = await import("../lib/referrals/refer-out");
const { outreachPlan, cardView } = await import("../lib/referrals/plan");
const { reciprocity, coldCards } = await import("../lib/referrals/nurture");
const { runTool } = await import("../lib/aeon/tools");
const { nudgeRefusal } = await import("../lib/referrals/refer-out");
const { suppress } = await import("../lib/referrals/contacts");
const { queueApproval } = await import("../lib/approvals");
const { POST: referOutPost } = await import("../app/api/referrals/[id]/refer-out/route");

const made: string[] = [];
const approvals: string[] = [];
let hasColumns = false;
const DNC_NPI = `1977${String(Date.now()).slice(-6)}`;

async function makeCard(name: string, stage = "connected", email: string | null = null, npi: string | null = null, npiType = "individual") {
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.referral_sources (npi, name, organization, taxonomy, specialty, npi_type, address, city, state, zip, stage, email, distance_miles, is_sample)
    values (${npi}, ${name}, ${npiType === "organization" ? name : null}, '207Q00000X', 'Family medicine', ${npiType}, '100 W Nurture St', 'Chicago', 'IL', '60614', ${stage}, ${email}, 0.3, true)
    returning id`;
  made.push(row.id);
  return row.id;
}

describe.skipIf(!local)("referral nurture (built-in database only)", () => {
  beforeAll(async () => {
    const cols = await db()<{ column_name: string }[]>`
      select column_name from information_schema.columns
       where table_schema = 'practice_os' and table_name in ('referral_contacts', 'referral_sources')
         and column_name in ('people_count', 'refer_out_availability')`;
    hasColumns = cols.length === 2;
  });

  afterAll(async () => {
    await db()`delete from practice_os.referral_suppressions where npi = ${DNC_NPI}`;
    await db()`delete from practice_os.referral_suppressions_org where name_key like '%nurture%'`;
    if (made.length) await db()`delete from practice_os.referral_sources where id in ${db()(made)}`;
    if (approvals.length) await db()`delete from practice_os.approvals where id in ${db()(approvals)}`;
    await closeDb();
  });

  it("referred_out stores a date and a count, and no client fields", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 045 or 046 (people_count, refer_out_* columns)
    const id = await makeCard("[Sample] Nurture Count, MD");
    const r = await logReferralOut(id, { count: 2, happenedOn: "2026-10-30", by: "clinician" });
    expect(r.contact).toMatchObject({ kind: "referred_out", happened_on: "2026-10-30", note: null, people_count: 2 });
    // The row has only these columns: nothing for a name, initials, age, reason or any client detail.
    const cols = (await db()<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_schema = 'practice_os' and table_name = 'referral_contacts' order by column_name`).map((c) => c.column_name);
    expect(cols).toEqual(["created_at", "created_by", "happened_on", "id", "is_sample", "kind", "note", "people_count", "source_id"]);
    // A note passed to the log is dropped for referred_out, never saved.
    const noted = await logContact(id, { kind: "referred_out", count: 1, note: "[Sample] someone's name", by: "clinician" });
    expect(noted.contact.note).toBeNull();
    // The audit keeps the kind, date and count only.
    const [a] = await db()<{ details: Record<string, unknown> }[]>`
      select details from practice_os.audit_log where action = 'referral_contact_logged' and subject_id = ${id} order by id desc limit 1`;
    expect(Object.keys(a.details).sort()).toEqual(["count", "kind", "next", "on", "stage"]);
  });

  it("the database refuses a note, a count out of range, or a count on another kind", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 045 or 046
    const id = await makeCard("[Sample] Nurture Refuse, MD");
    const insert = (kind: string, note: string | null, count: number | null) =>
      db()`insert into practice_os.referral_contacts (source_id, kind, happened_on, note, created_by, people_count) values (${id}, ${kind}, current_date, ${note}, 'clinician', ${count})`;
    await expect(insert("referred_out", "[Sample] who it was", 1)).rejects.toThrow(/referred_out_date_and_count/);
    await expect(insert("referred_out", null, 21)).rejects.toThrow(/referred_out_date_and_count/);
    // After 045 then 046 a referred_out row still needs a count: 045's strict check stands.
    await expect(insert("referred_out", null, null)).rejects.toThrow(/referred_out_date_and_count/);
    const [applied] = await db()<{ n: number }[]>`
      select count(*)::int as n from practice_os.schema_migrations where name in ('045_referral_dnc_org.sql', '046_referral_nurture.sql')`;
    expect(applied.n).toBe(2);
    await expect(insert("called", null, 2)).rejects.toThrow(/count_only_referred_out/);
    await expect(logReferralOut(id, { count: 0, by: "clinician" })).rejects.toThrow(/from 1 to 20/);
    await expect(logReferralOut(id, { count: 21, by: "clinician" })).rejects.toThrow(/from 1 to 20/);
  });

  it("reciprocity comes from the rows: they referred 1, she referred 3", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 045 or 046
    const id = await makeCard("[Sample] Nurture Both, MD");
    await logContact(id, { kind: "referred", happenedOn: "2026-10-01", by: "clinician" });
    await logReferralOut(id, { count: 2, happenedOn: "2026-10-10", by: "clinician" });
    await logReferralOut(id, { count: 1, happenedOn: "2026-10-20", by: "clinician" });
    const contacts = (await contactsFor([id]))[id];
    expect(reciprocity(contacts).line).toBe("They've referred 1 · You've referred 3");
    const view = await cardView(id);
    expect(view?.contacts.filter((c) => c.kind === "referred_out").map((c) => c.people_count)).toEqual([1, 2]);
  });

  it("her notes about them are checked with the note guard, and saved only when they pass", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 046 (refer_out_* columns)
    const id = await makeCard("[Sample] Nurture Notes, PsyD");
    const refuse = async () => ({ ok: false as const, kind: "client_name" as const });
    await expect(saveReferOutNotes(id, { availability: "[Sample] my client J.D. needs Tuesdays" }, undefined, refuse as never)).rejects.toThrow();
    expect((await referOutNotesFor([id]))[id]).toBeUndefined();
    const ok = async (t: string) => ({ ok: true as const, text: t });
    const saved = await saveReferOutNotes(id, { availability: "[Sample] Openings Tuesday evenings", fees: "[Sample] $150", insurance: "[Sample] BCBS PPO" }, undefined, ok as never);
    expect(saved).toEqual({ availability: "[Sample] Openings Tuesday evenings", fees: "[Sample] $150", insurance: "[Sample] BCBS PPO" });
    // A field left out keeps its value; an empty one clears it.
    const next = await saveReferOutNotes(id, { fees: "" }, undefined, ok as never);
    expect(next).toEqual({ availability: "[Sample] Openings Tuesday evenings", fees: null, insurance: "[Sample] BCBS PPO" });
    expect((await referOutNotesFor([id]))[id]).toEqual(next);
    await expect(saveReferOutNotes(id, { insurance: "x".repeat(201) }, undefined, ok as never)).rejects.toThrow(/under 200/);
    const [a] = await db()<{ details: { fields: string[] } }[]>`
      select details from practice_os.audit_log where action = 'referral_refer_out_notes_saved' and subject_id = ${id} order by id desc limit 1`;
    expect(a.details).toEqual({ fields: ["fees"] });
  });

  it("the weekly plan adds at most 2 going-cold nudges, each one really going cold", async (ctx) => {
    if (!hasColumns) ctx.skip(); // contactsFor reads people_count (migration 045 or 046)
    for (const n of [1, 2, 3]) {
      const id = await makeCard(`[Sample] Nurture Cold ${n}, MD`, "connected", `cold${n}@example.com`);
      const on = new Date(Date.now() - (200 + n) * 86_400_000).toISOString().slice(0, 10);
      await db()`insert into practice_os.referral_contacts (source_id, kind, happened_on, created_by, is_sample) values (${id}, 'met', ${on}, 'clinician', true)`;
    }
    const plan = await outreachPlan();
    expect(plan.going_cold.length).toBeGreaterThan(0);
    expect(plan.going_cold.length).toBeLessThanOrEqual(2);
    const ids = plan.going_cold.map((g) => g.id);
    const views = await Promise.all(ids.map((id) => cardView(id)));
    const cold = coldCards(views.map((v) => v!.card), Object.fromEntries(views.map((v) => [v!.card.id, v!.contacts])), Object.fromEntries(views.map((v) => [v!.card.id, v!.tier])), plan.today, "America/Chicago");
    expect(Object.keys(cold).sort()).toEqual([...ids].sort());
    expect(plan.summary).toMatch(/Going cold \([12]\):/);
    for (const g of plan.going_cold) expect(g.label).toMatch(/^Going cold: last contact \d+ weeks ago$/);
  });

  it("over MCP, log_referral_out waits in her Approvals and logs nothing", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 045 or 046
    const id = await makeCard("[Sample] Nurture Mcp, MD");
    const r = await runTool("log_referral_out", { source: id, count: 1 }, { by: "mcp:vitest" });
    const body = JSON.parse(r.content[0].text) as { waiting_for_her?: boolean; approval_id?: string };
    expect(body).toMatchObject({ waiting_for_her: true, where: "her Approvals" });
    approvals.push(body.approval_id!);
    expect((await contactsFor([id]))[id] ?? []).toEqual([]);
    const [ap] = await db()<{ kind: string; status: string }[]>`select kind, status from practice_os.approvals where id = ${body.approval_id!}`;
    expect(ap).toMatchObject({ kind: "aeon_action", status: "pending" });
  });

  it("in the chat, log_referral_out logs the count and returns the reciprocity line", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 045 or 046
    const id = await makeCard("[Sample] Nurture Chat, MD");
    const r = await runTool("log_referral_out", { source: id, count: 3, happened_on: "2026-10-30", date_confirmed: true }, { by: "chat:vitest", mode: "bypass" });
    const body = JSON.parse(r.content.at(-1)!.text) as Record<string, unknown>;
    expect(body).toMatchObject({ logged: true, people: 3, on: "2026-10-30", reciprocity: "They've referred 0 · You've referred 3" });
    expect(JSON.stringify(body)).not.toMatch(/client name|initials/i);
  });

  async function met(id: string, daysAgo: number) {
    const on = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    await db()`insert into practice_os.referral_contacts (source_id, kind, happened_on, created_by, is_sample) values (${id}, 'met', ${on}, 'clinician', true)`;
  }

  it("the weekly plan runs with NPI and org-key do-not-contact cards and leaves both out", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 046
    const byNpi = await makeCard("[Sample] Nurture Dnc Npi, MD", "connected", "dnc1@example.com", DNC_NPI);
    const byOrg = await makeCard("[Sample] Nurture Dnc Org Clinic", "connected", "dnc2@example.com", null, "organization");
    const fresh = await makeCard("[Sample] Nurture Dnc Found Clinic", "found", null, null, "organization");
    for (const id of [byNpi, byOrg]) await met(id, 400);
    await suppress(byNpi, "asked_not_to");
    await suppress(byOrg, "not_interested");
    await suppress(fresh, "asked_not_to");
    // suppress moves them to Not a fit; put them back so only the list keeps them out.
    await db()`update practice_os.referral_sources set stage = 'connected' where id in ${db()([byNpi, byOrg])}`;
    await db()`update practice_os.referral_sources set stage = 'found' where id = ${fresh}`;
    const plan = await outreachPlan();
    const ids = [...plan.going_cold.map((g) => g.id), ...plan.reach_out.map((r) => r.id), ...plan.follow_ups.map((f) => f.id)];
    expect(ids).not.toContain(byNpi);
    expect(ids).not.toContain(byOrg);
    expect(ids).not.toContain(fresh);
  });

  it("plan nudges and the nudge draft skip a card with a letter waiting, and never overwrite it", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 046
    const warm = await makeCard("[Sample] Nurture Warm, MD", "connected", "warm@example.com");
    await met(warm, 5);
    expect(await nudgeRefusal(warm)).toMatch(/isn't going cold/);
    const cold = await makeCard("[Sample] Nurture Waiting, MD", "connected", "wait@example.com");
    await met(cold, 300);
    expect(await nudgeRefusal(cold)).toBeNull();
    const letter = await queueApproval({
      kind: "referral_letter",
      title: "[Sample] letter",
      preview: { body: "[Sample]" },
      payload: { referral_source_id: cold, subject: "[Sample] Hello", letter: "[Sample] Dear colleague" },
      createdBy: "test",
    });
    approvals.push(letter);
    expect(await nudgeRefusal(cold)).toMatch(/already waiting in Approvals/);
    const plan = await outreachPlan(undefined, 3);
    expect(plan.going_cold.map((g) => g.id)).not.toContain(cold);
    const [row] = await db()<{ letter: string }[]>`select payload ->> 'letter' as letter from practice_os.approvals where id = ${letter}`;
    expect(row.letter).toBe("[Sample] Dear colleague");
  });

  it("the refer-out route refuses a missing, non-number or out-of-range count with 400", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 046
    const id = await makeCard("[Sample] Nurture Route, MD");
    const call = (body: unknown) =>
      referOutPost(
        new Request(`http://localhost:3000/api/referrals/${id}/refer-out`, {
          method: "POST",
          headers: { "content-type": "application/json", host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id }) } as never,
      );
    for (const bad of [{}, { count: "2" }, { count: 0 }, { count: 21 }, { count: 1.5 }]) expect((await call(bad)).status).toBe(400);
    expect((await contactsFor([id]))[id] ?? []).toEqual([]);
    const ok = await call({ count: 2 });
    expect(ok.status).toBe(200);
    expect(((await contactsFor([id]))[id] ?? []).map((c) => c.people_count)).toEqual([2]);
  });

  it("a queued log_referral_out shows the card, count and resolved date, and the approved run logs that date", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 046
    const id = await makeCard("[Sample] Nurture Queued, MD");
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(Date.now() - 86_400_000));
    const r = await runTool("log_referral_out", { source: id, count: 2, date_words: "yesterday" }, { by: "mcp:vitest", said: ["I referred two people to them yesterday"] });
    const body = JSON.parse(r.content[0].text) as { approval_id: string };
    approvals.push(body.approval_id);
    const [ap] = await db()<{ preview: { body: string }; payload: { tool: string; args: Record<string, unknown> } }[]>`
      select preview, payload from practice_os.approvals where id = ${body.approval_id}`;
    expect(ap.preview.body).toContain("[Sample] Nurture Queued, MD");
    expect(ap.preview.body).toContain("2 people");
    expect(ap.preview.body).toContain(`(${iso})`);
    expect(ap.payload.args).toMatchObject({ source: id, count: 2, happened_on: iso, date_confirmed: true });
    // Approved later: the queued day is what gets logged, not the day she approves.
    await runTool(ap.payload.tool, ap.payload.args, { by: "clinician", approved: true, mode: "bypass" });
    expect(((await contactsFor([id]))[id] ?? []).map((c) => [c.happened_on, c.people_count])).toEqual([[iso, 2]]);
  });

  it("a queued log_referral_contact keeps its resolved date and names the card", async (ctx) => {
    if (!hasColumns) ctx.skip(); // needs migration 046
    const id = await makeCard("[Sample] Nurture Called, MD");
    const r = await runTool("log_referral_contact", { source: id, kind: "called", happened_on: "2026-10-28", date_confirmed: true }, { by: "mcp:vitest" });
    const body = JSON.parse(r.content[0].text) as { approval_id: string };
    approvals.push(body.approval_id);
    const [ap] = await db()<{ preview: { body: string }; payload: { args: Record<string, unknown> } }[]>`
      select preview, payload from practice_os.approvals where id = ${body.approval_id}`;
    expect(ap.preview.body).toContain('Log "Called" for [Sample] Nurture Called, MD on');
    expect(ap.preview.body).toContain("(2026-10-28)");
    expect(ap.payload.args).toMatchObject({ source: id, happened_on: "2026-10-28" });
  });
});
