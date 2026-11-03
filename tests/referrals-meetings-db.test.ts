// The Referrals calendar against the database (migration 047): saving, listing, moving and
// canceling meetings, notes refused by the privacy and referral-value checks, the open-slot finder
// with her office days and time zone, the routes, and plan_referral_meeting, which only queues a
// referral_meeting approval whose executor saves the meeting. It writes and deletes rows, so it
// runs ONLY against the built-in throwaway database on this computer (like
// tests/referrals-nurture-db.test.ts), never a shared one named in .env. Fake data only. Every
// date is explicit and far ahead (2030), never "now" plus an interval.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The privacy guard: a pass-through, except text with the marker below, which it refuses as a client name.
const CLIENT = "SAMPLECLIENTMARKER";
vi.mock("../lib/aeon/guard", async (orig) => ({
  ...(await orig<typeof import("../lib/aeon/guard")>()),
  guard: vi.fn(async (t: string) => (t.includes(CLIENT) ? { ok: false, kind: "client_name" } : { ok: true, text: t })),
}));

import { loadEnv } from "../lib/env";
import { projectRefOf } from "../lib/demo-reset";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const meetings = await import("../lib/referrals/meetings");
const { runTool } = await import("../lib/aeon/tools");
const { approve } = await import("../lib/approvals");
const { executors } = await import("../lib/executors");
const { suppress } = await import("../lib/referrals/contacts");
const listRoute = await import("../app/api/referrals/meetings/route");
const oneRoute = await import("../app/api/referrals/meetings/[id]/route");

const { createMeeting, listMeetings, updateMeeting, cancelMeeting, findOpenSlots, daysRange, getMeeting, meetingLabel, PAST_TIME } = meetings;

const CHI = "America/Chicago";
const made: string[] = [];
const approvals: string[] = [];
let saved: { timezone: string; office_hours: unknown } | null = null;

async function makeCard(name: string) {
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.referral_sources (name, organization, specialty, npi_type, address, city, state, zip, stage, distance_miles, is_sample)
    values (${name}, ${name}, 'Oncology', 'organization', '100 W Meeting St', 'Chicago', 'IL', '60614', 'connected', 0.4, true)
    returning id`;
  made.push(row.id);
  return row.id;
}

const json = (body: unknown, method = "POST", url = "http://localhost:3000/api/referrals/meetings") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json", host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

/** Mon 2030-03-04 .. Fri 2030-03-08: a plain CST week, far ahead. */
const WEEK = () => daysRange("2030-03-04", "2030-03-08", CHI);
const clearWeek = (from = "2030-03-01T00:00:00Z", to = "2030-04-30T00:00:00Z") =>
  db()`delete from practice_os.referral_meetings where starts_at >= ${from} and starts_at < ${to}`;

describe.skipIf(!local)("referral meetings (built-in database only)", () => {
  beforeAll(async () => {
    const [s] = await db()<{ timezone: string }[]>`select timezone from practice_os.settings limit 1`;
    const [p] = await db()<{ office_hours: unknown }[]>`select office_hours from practice_os.clinician_profile limit 1`;
    saved = { timezone: s?.timezone ?? CHI, office_hours: p?.office_hours ?? null };
    await db()`update practice_os.settings set timezone = ${CHI}`;
    await db()`update practice_os.clinician_profile set office_hours = ${db().json({ weekdays: [1, 2, 3, 4, 5], closed_on: [], close_federal_holidays: true } as never)}`;
    await clearWeek();
    await db()`delete from practice_os.approvals where kind = 'referral_meeting' and payload ->> 'starts_at' like '2030-%'`;
  });

  afterAll(async () => {
    if (saved) {
      await db()`update practice_os.settings set timezone = ${saved.timezone}`;
      if (saved.office_hours) await db()`update practice_os.clinician_profile set office_hours = ${db().json(saved.office_hours as never)}`;
    }
    if (made.length) await db()`delete from practice_os.referral_suppressions_org where name_key like '%meetingtest%'`;
    if (made.length) await db()`delete from practice_os.referral_sources where id in ${db()(made)}`; // meetings go with them (on delete cascade)
    if (approvals.length) await db()`delete from practice_os.approvals where id in ${db()(approvals)}`;
    await closeDb();
  });

  it("the table has RLS on, no policies, and cascades with its card", async () => {
    const [t] = await db()<{ rls: boolean; policies: number }[]>`
      select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.schemaname = 'practice_os' and p.tablename = 'referral_meetings') as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'practice_os' and c.relname = 'referral_meetings'`;
    expect(t).toEqual({ rls: true, policies: 0 });
    const card = await makeCard("[Sample] Meetingtest Cascade Clinic");
    const { meeting } = await createMeeting({ sourceId: card, kind: "call", startsAt: "2030-04-01T15:00:00Z", by: "clinician" });
    await db()`delete from practice_os.referral_sources where id = ${card}`;
    expect(await getMeeting(meeting.id)).toBeNull();
  });

  it("saves, lists, moves and cancels a meeting; the default length follows the kind", async () => {
    const card = await makeCard("[Sample] Meetingtest Oncology Group");
    const { meeting, already } = await createMeeting({ sourceId: card, kind: "coffee", startsAt: "2030-03-07T16:00:00Z", location: "[Sample] Cafe", notes: "[Sample] Bring the practice sheet.", by: "clinician" });
    expect(already).toBe(false);
    expect(meeting).toMatchObject({ source_id: card, kind: "coffee", status: "planned", starts_at: "2030-03-07T16:00:00.000Z", ends_at: "2030-03-07T16:45:00.000Z", created_by: "clinician" });
    expect(meeting.source_name).toBe("[Sample] Meetingtest Oncology Group");

    const inWeek = await listMeetings(WEEK());
    expect(inWeek.map((m) => m.id)).toContain(meeting.id);
    expect((await listMeetings(daysRange("2030-03-11", "2030-03-15", CHI))).map((m) => m.id)).not.toContain(meeting.id);

    // Moving the start keeps its length.
    const moved = await updateMeeting(meeting.id, { startsAt: "2030-03-07T18:00:00Z", by: "clinician" });
    expect([moved.starts_at, moved.ends_at]).toEqual(["2030-03-07T18:00:00.000Z", "2030-03-07T18:45:00.000Z"]);
    const cleared = await updateMeeting(meeting.id, { location: null, by: "clinician" });
    expect(cleared.location).toBeNull();
    expect(cleared.notes).toBe("[Sample] Bring the practice sheet.");

    const canceled = await cancelMeeting(meeting.id, "clinician");
    expect(canceled.status).toBe("canceled");
    expect((await listMeetings(WEEK())).map((m) => m.id)).not.toContain(meeting.id);
    expect((await listMeetings(WEEK(), { includeCanceled: true })).map((m) => m.id)).toContain(meeting.id);
    const [a] = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.audit_log where action = 'referral_meeting_canceled' and details ->> 'meeting_id' = ${meeting.id}`;
    expect(a.n).toBe(1);
  });

  it("refuses bad times, a note with a client detail, and a note offering something for referrals", async () => {
    const card = await makeCard("[Sample] Meetingtest Hospice");
    const at = "2030-03-05T16:00:00Z";
    await expect(createMeeting({ sourceId: card, kind: "call", startsAt: "not a time", by: "clinician" })).rejects.toThrow(/couldn't read/);
    await expect(createMeeting({ sourceId: card, kind: "call", startsAt: at, endsAt: at, by: "clinician" })).rejects.toThrow(/end after it starts/);
    await expect(createMeeting({ sourceId: card, kind: "call", startsAt: at, endsAt: "2030-03-06T16:00:00Z", by: "clinician" })).rejects.toThrow(/8 hours/);
    await expect(createMeeting({ sourceId: card, kind: "call", startsAt: at, notes: `Ask about ${CLIENT}'s intake`, by: "clinician" })).rejects.toThrow(/person's name/);
    // A check passed in wins over the default one.
    await expect(createMeeting({ sourceId: card, kind: "call", startsAt: at, notes: "[Sample] Agenda", by: "clinician" }, undefined, async () => ({ ok: false, kind: "diagnosis" }))).rejects.toThrow(/diagnosis/);
    await expect(createMeeting({ sourceId: card, kind: "coffee", startsAt: at, notes: "Bring a gift card for each referral", by: "clinician" })).rejects.toThrow(/Nothing of value/);
    await expect(createMeeting({ sourceId: "00000000-0000-4000-8000-00000000dead", kind: "call", startsAt: at, by: "clinician" })).rejects.toThrow(/no longer on the board/);
    const { meeting } = await createMeeting({ sourceId: card, kind: "call", startsAt: at, by: "clinician" });
    await expect(updateMeeting(meeting.id, { notes: `${CLIENT} again`, by: "clinician" })).rejects.toThrow(/person's name/);
    expect((await getMeeting(meeting.id))!.notes).toBeNull();
    const [n] = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.referral_meetings where source_id = ${card}`;
    expect(n.n).toBe(1);
  });

  it("findOpenSlots uses her open days and time zone and skips what is planned", async () => {
    await clearWeek();
    const card = await makeCard("[Sample] Meetingtest Grief Center");
    await db()`update practice_os.clinician_profile set office_hours = ${db().json({ weekdays: [2, 4], closed_on: ["2030-03-07"], close_federal_holidays: true } as never)}`;
    try {
      // Tue 2030-03-05 9:00 to 10:00 CST is taken.
      await createMeeting({ sourceId: card, kind: "meeting", startsAt: "2030-03-05T15:00:00Z", by: "clinician" });
      const { slots, timeZone } = await findOpenSlots(WEEK(), 60, undefined, { limit: 100 });
      expect(timeZone).toBe(CHI);
      const labels = slots.map((s) => meetingLabel(s.start, CHI));
      expect(new Set(labels.map((l) => l.split(",")[0]))).toEqual(new Set(["Tue Mar 5"])); // Thu Mar 7 is closed
      expect(labels[0]).toBe("Tue Mar 5, 10:00 am");
      expect(labels.at(-1)).toBe("Tue Mar 5, 4:00 pm");
    } finally {
      await db()`update practice_os.clinician_profile set office_hours = ${db().json({ weekdays: [1, 2, 3, 4, 5], closed_on: [], close_federal_holidays: true } as never)}`;
    }
  });

  it("plan_referral_meeting queues an approval and writes nothing; approving saves the meeting once", async () => {
    await clearWeek();
    const card = await makeCard("[Sample] Meetingtest Quillwick Oncology");
    const r = await runTool("plan_referral_meeting", { partner: card, kind: "coffee", from: "2030-03-04", to: "2030-03-08", location: "[Sample] Cafe" }, { by: "chat:vitest", mode: "manual" });
    const out = JSON.parse(r.content[0].text);
    expect(out.queued).toBe(true);
    expect(out.proposed).toMatchObject({ with: "[Sample] Meetingtest Quillwick Oncology", kind: "Coffee", when: "Mon Mar 4, 9:00 am", minutes: 45 });
    expect(out.also_open[0]).toBe("Mon Mar 4, 9:30 am");
    approvals.push(out.approval_id);
    const [row] = await db()<{ kind: string; status: string; payload: Record<string, unknown> }[]>`select kind, status, payload from practice_os.approvals where id = ${out.approval_id}`;
    expect(row).toMatchObject({ kind: "referral_meeting", status: "pending" });
    expect(row.payload).toMatchObject({ referral_source_id: card, kind: "coffee", starts_at: "2030-03-04T15:00:00.000Z", ends_at: "2030-03-04T15:45:00.000Z" });
    const none = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.referral_meetings where source_id = ${card}`;
    expect(none[0].n).toBe(0); // nothing on the calendar before she approves

    // The same plan again is the same approval; a second, different plan skips the time already proposed.
    const again = JSON.parse((await runTool("plan_referral_meeting", { partner: card, kind: "coffee", from: "2030-03-04", to: "2030-03-08", location: "[Sample] Cafe" }, { by: "chat:vitest", mode: "manual" })).content[0].text);
    expect(again.approval_id === out.approval_id || again.proposed.when !== out.proposed.when).toBe(true);
    if (again.approval_id !== out.approval_id) approvals.push(again.approval_id);
    expect(again.proposed.when).toBe("Mon Mar 4, 10:00 am");

    const done = await approve(out.approval_id, { by: "clinician" });
    expect(done.ok && done.approval.status).toBe("done");
    const saved = await db()<{ id: string; starts_at: Date; approval_id: string; created_by: string }[]>`select id, starts_at, approval_id, created_by from practice_os.referral_meetings where source_id = ${card}`;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ approval_id: out.approval_id, created_by: "executor" });
    expect(new Date(saved[0].starts_at).toISOString()).toBe("2030-03-04T15:00:00.000Z");

    // A second tap is refused; running the executor again returns the same meeting.
    expect(await approve(out.approval_id, { by: "clinician" })).toMatchObject({ ok: false, reason: "not_pending" });
    const [full] = await db()`select * from practice_os.approvals where id = ${out.approval_id}`;
    const rerun = await executors.referral_meeting!(full as never, { dryRun: false });
    expect(rerun).toMatchObject({ meeting_id: saved[0].id, already: true });
    expect((await db()`select id from practice_os.referral_meetings where source_id = ${card}`).length).toBe(1);

    // A time she named that is already taken is refused, with open times to offer instead.
    const clash = JSON.parse((await runTool("plan_referral_meeting", { partner: card, kind: "call", starts_at: "2030-03-04T09:15:00-06:00" }, { by: "chat:vitest" })).content[0].text);
    expect(clash.queued).toBe(false);
    expect(clash.why).toMatch(/already planned/);
    expect(clash.also_open.length).toBeGreaterThan(0);

    // list_referral_meetings reads it back.
    const listed = JSON.parse((await runTool("list_referral_meetings", { from: "2030-03-04", to: "2030-03-08", partner: card }, { by: "chat:vitest" })).content[0].text);
    expect(listed.meetings).toEqual([expect.objectContaining({ with: "[Sample] Meetingtest Quillwick Oncology", kind: "Coffee", when: "Mon Mar 4, 9:00 am", minutes: 45, status: "planned" })]);
  });

  it("plan_referral_meeting refuses a client detail or a reward in the note, and a do-not-contact card, before anything is queued", async () => {
    const card = await makeCard("[Sample] Meetingtest Fernwick Pediatrics");
    const count = async () => (await db()<{ n: number }[]>`select count(*)::int as n from practice_os.approvals where kind = 'referral_meeting' and payload ->> 'referral_source_id' = ${card}`)[0].n;
    const phi = JSON.parse((await runTool("plan_referral_meeting", { partner: card, kind: "call", from: "2030-03-11", to: "2030-03-15", notes: `About ${CLIENT}` }, { by: "chat:vitest" })).content[0].text);
    expect(phi).toMatchObject({ queued: false });
    expect(phi.why).toMatch(/person's name/);
    const gift = JSON.parse((await runTool("plan_referral_meeting", { partner: card, kind: "coffee", from: "2030-03-11", to: "2030-03-15", notes: "Coffee is on me if they refer" }, { by: "chat:vitest" })).content[0].text);
    expect(gift.why).toMatch(/Nothing of value/);
    expect(await count()).toBe(0);

    // Queued, then marked do-not-contact before she approves: the executor refuses and nothing is saved.
    const ok = JSON.parse((await runTool("plan_referral_meeting", { partner: card, kind: "call", from: "2030-03-11", to: "2030-03-15" }, { by: "mcp:vitest" })).content[0].text);
    expect(ok.queued).toBe(true);
    approvals.push(ok.approval_id);
    await suppress(card, "asked_not_to");
    const res = await approve(ok.approval_id, { by: "clinician" });
    expect(res.ok && res.approval.status).toBe("failed");
    expect(res.ok && res.approval.error).toMatch(/do-not-contact/);
    expect((await db()`select id from practice_os.referral_meetings where source_id = ${card}`).length).toBe(0);
    const later = JSON.parse((await runTool("plan_referral_meeting", { partner: card, kind: "call", from: "2030-03-11", to: "2030-03-15" }, { by: "chat:vitest" })).content[0].text);
    expect(later.why).toMatch(/do-not-contact/);
  });

  it("queue_approval can't queue a referral_meeting directly", async () => {
    const r = await runTool("queue_approval", { kind: "referral_meeting", title: "x" }, { by: "mcp:vitest" });
    expect(r.isError).toBe(true);
  });

  it("the routes: GET a range, POST, PATCH and DELETE (cancel), only from the app's own page", async () => {
    const card = await makeCard("[Sample] Meetingtest Route Clinic");
    const posted = await listRoute.POST(json({ source_id: card, kind: "lunch_talk", starts_at: "2030-04-02T17:00:00Z", notes: "[Sample] 20-minute talk" }));
    expect(posted.status).toBe(201);
    const { meeting } = await posted.json();
    expect(meeting).toMatchObject({ kind: "lunch_talk", ends_at: "2030-04-02T18:00:00.000Z", created_by: "clinician" });

    const bad = await listRoute.POST(json({ source_id: card, kind: "lunch_talk", starts_at: "2030-04-02T17:00:00Z", notes: `${CLIENT}` }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/person's name/);
    const cross = await listRoute.POST(new Request("http://localhost:3000/api/referrals/meetings", { method: "POST", headers: { "content-type": "application/json", host: "localhost:3000", "sec-fetch-site": "cross-site" }, body: "{}" }));
    expect(cross.status).toBe(403);

    const got = await listRoute.GET(new Request("http://localhost:3000/api/referrals/meetings?from=2030-04-01T00:00:00Z&to=2030-04-08T00:00:00Z", { headers: { host: "localhost:3000" } }));
    expect((await got.json()).meetings.map((m: { id: string }) => m.id)).toContain(meeting.id);
    expect((await listRoute.GET(new Request("http://localhost:3000/api/referrals/meetings?from=nope&to=2030-04-08T00:00:00Z"))).status).toBe(400);

    const url = `http://localhost:3000/api/referrals/meetings/${meeting.id}`;
    const patched = await oneRoute.PATCH(json({ starts_at: "2030-04-02T18:00:00Z", location: "[Sample] Their office" }, "PATCH", url), params(meeting.id));
    expect((await patched.json()).meeting).toMatchObject({ starts_at: "2030-04-02T18:00:00.000Z", ends_at: "2030-04-02T19:00:00.000Z", location: "[Sample] Their office" });
    expect((await oneRoute.PATCH(json({ status: "maybe" }, "PATCH", url), params(meeting.id))).status).toBe(400);
    const del = await oneRoute.DELETE(json({}, "DELETE", url), params(meeting.id));
    expect((await del.json()).meeting.status).toBe("canceled");
    expect((await oneRoute.DELETE(json({}, "DELETE", url), params("00000000-0000-4000-8000-00000000dead"))).status).toBe(404);
  });

  it("refuses a time that has passed (a fixed now), in createMeeting, updateMeeting and the executor", async () => {
    const card = await makeCard("[Sample] Meetingtest Past Clinic");
    const now = new Date("2030-04-10T17:00:00Z");
    await expect(createMeeting({ sourceId: card, kind: "call", startsAt: "2030-04-10T16:00:00Z", by: "clinician" }, undefined, undefined, now)).rejects.toThrow(PAST_TIME);
    await expect(createMeeting({ sourceId: card, kind: "call", startsAt: "2030-04-10T17:00:00Z", by: "clinician" }, undefined, undefined, now)).rejects.toThrow(PAST_TIME);
    await expect(createMeeting({ sourceId: card, kind: "call", startsAt: "2020-01-06T15:00:00Z", by: "clinician" })).rejects.toThrow(PAST_TIME);
    const { meeting } = await createMeeting({ sourceId: card, kind: "call", startsAt: "2030-04-10T18:00:00Z", by: "clinician" }, undefined, undefined, now);
    await expect(updateMeeting(meeting.id, { startsAt: "2030-04-10T16:30:00Z", by: "clinician" }, undefined, undefined, now)).rejects.toThrow(PAST_TIME);
    // Marking a meeting done after it happened is fine.
    expect((await updateMeeting(meeting.id, { status: "done", by: "clinician" }, undefined, undefined, new Date("2030-04-11T00:00:00Z"))).status).toBe("done");
    // findOpenSlots never offers a time before now.
    const { slots } = await findOpenSlots(daysRange("2030-04-08", "2030-04-12", CHI), 30, undefined, { limit: 200, now });
    expect(slots.every((s) => s.start > now)).toBe(true);
    expect(meetingLabel(slots[0].start, CHI)).toBe("Wed Apr 10, 12:30 pm"); // 12:00 pm CDT is now

    // Approved after the proposed time went by: the executor refuses and saves nothing.
    const r = JSON.parse((await runTool("plan_referral_meeting", { partner: card, kind: "call", from: "2030-04-15", to: "2030-04-19" }, { by: "chat:vitest" })).content[0].text);
    approvals.push(r.approval_id);
    await db()`update practice_os.approvals set payload = payload || ${db().json({ starts_at: "2020-01-06T15:00:00.000Z", ends_at: "2020-01-06T15:20:00.000Z" } as never)} where id = ${r.approval_id}`;
    const res = await approve(r.approval_id, { by: "clinician" });
    expect(res.ok && res.approval.status).toBe("failed");
    expect(res.ok && res.approval.error).toBe(PAST_TIME);
    expect((await db()`select id from practice_os.referral_meetings where approval_id = ${r.approval_id}`).length).toBe(0);
  });

  it("refuses an overlap in createMeeting, updateMeeting and the executor", async () => {
    const card = await makeCard("[Sample] Meetingtest Clash Clinic");
    const { meeting: a } = await createMeeting({ sourceId: card, kind: "meeting", startsAt: "2030-04-22T15:00:00Z", by: "clinician" }); // 10 to 11 CDT
    await expect(createMeeting({ sourceId: card, kind: "call", startsAt: "2030-04-22T15:30:00Z", by: "clinician" })).rejects.toThrow(/already planned/);
    const { meeting: b } = await createMeeting({ sourceId: card, kind: "call", startsAt: "2030-04-22T16:00:00Z", by: "clinician" }); // back to back is fine
    await expect(updateMeeting(b.id, { startsAt: "2030-04-22T15:45:00Z", by: "clinician" })).rejects.toThrow(/already planned/);
    // Canceled, its time is free; restoring it onto a taken time is refused.
    await cancelMeeting(a.id, "clinician");
    await createMeeting({ sourceId: card, kind: "coffee", startsAt: "2030-04-22T15:00:00Z", by: "clinician" });
    await expect(updateMeeting(a.id, { status: "planned", by: "clinician" })).rejects.toThrow(/already planned/);
    // Two saves at once for the same time: the booking lock lets exactly one through.
    const both = await Promise.allSettled([
      createMeeting({ sourceId: card, kind: "call", startsAt: "2030-04-23T15:00:00Z", by: "clinician" }),
      createMeeting({ sourceId: card, kind: "call", startsAt: "2030-04-23T15:05:00Z", by: "clinician" }),
    ]);
    expect(both.filter((x) => x.status === "fulfilled")).toHaveLength(1);

    // Queued, then she books that time herself: approving fails and nothing doubles up.
    const r = JSON.parse((await runTool("plan_referral_meeting", { partner: card, kind: "call", from: "2030-04-24", to: "2030-04-24" }, { by: "chat:vitest" })).content[0].text);
    approvals.push(r.approval_id);
    const [p] = await db()<{ starts_at: string }[]>`select payload ->> 'starts_at' as starts_at from practice_os.approvals where id = ${r.approval_id}`;
    await createMeeting({ sourceId: card, kind: "coffee", startsAt: p.starts_at, by: "clinician" });
    const res = await approve(r.approval_id, { by: "clinician" });
    expect(res.ok && res.approval.status).toBe("failed");
    expect(res.ok && res.approval.error).toMatch(/already planned/);
  });

  it("screens the place like the note: on save, in the tool, and when listed", async () => {
    const card = await makeCard("[Sample] Meetingtest Place Clinic");
    await expect(createMeeting({ sourceId: card, kind: "coffee", startsAt: "2030-04-29T15:00:00Z", location: `${CLIENT}'s house`, by: "clinician" })).rejects.toThrow(/person's name/);
    const { meeting } = await createMeeting({ sourceId: card, kind: "coffee", startsAt: "2030-04-29T15:00:00Z", location: "[Sample] Cafe", by: "clinician" });
    await expect(updateMeeting(meeting.id, { location: `Near ${CLIENT}`, by: "clinician" })).rejects.toThrow(/person's name/);
    const tool = JSON.parse((await runTool("plan_referral_meeting", { partner: card, kind: "call", from: "2030-04-29", to: "2030-04-30", location: `${CLIENT} home` }, { by: "chat:vitest" })).content[0].text);
    expect(tool.queued).toBe(false);
    expect(tool.why).toMatch(/person's name/);
    // A place saved some other way is held back when listed.
    await db()`update practice_os.referral_meetings set location = ${`${CLIENT} home`} where id = ${meeting.id}`;
    const listed = JSON.parse((await runTool("list_referral_meetings", { from: "2030-04-29", to: "2030-04-29", partner: card }, { by: "chat:vitest" })).content[0].text);
    expect(listed.meetings[0].location).toBeNull();
  });

  it("POST and PATCH refuse a planned meeting with a do-not-contact or Not a fit card", async () => {
    const card = await makeCard("[Sample] Meetingtest Blocked Clinic");
    const { meeting } = await createMeeting({ sourceId: card, kind: "call", startsAt: "2030-05-06T15:00:00Z", by: "clinician" });
    await db()`update practice_os.referral_sources set stage = 'not_a_fit' where id = ${card}`;
    const posted = await listRoute.POST(json({ source_id: card, kind: "call", starts_at: "2030-05-07T15:00:00Z" }));
    expect(posted.status).toBe(409);
    expect((await posted.json()).error).toMatch(/Not a fit/);
    const url = `http://localhost:3000/api/referrals/meetings/${meeting.id}`;
    expect((await oneRoute.PATCH(json({ starts_at: "2030-05-06T16:00:00Z" }, "PATCH", url), params(meeting.id))).status).toBe(409);
    // Canceling or marking done still works.
    expect((await (await oneRoute.PATCH(json({ status: "canceled" }, "PATCH", url), params(meeting.id))).json()).meeting.status).toBe("canceled");
    await db()`update practice_os.referral_sources set stage = 'connected' where id = ${card}`;
    await suppress(card, "asked_not_to");
    const dnc = await listRoute.POST(json({ source_id: card, kind: "call", starts_at: "2030-05-07T15:00:00Z" }));
    expect(dnc.status).toBe(409);
    expect((await dnc.json()).error).toMatch(/do-not-contact/);
  });

  it("workHours reads saved start and end hours, falls back to 9 to 5, and doesn't hide a database error", async () => {
    const set = (oh: Record<string, unknown>) => db()`update practice_os.clinician_profile set office_hours = ${db().json({ weekdays: [1, 2, 3, 4, 5], closed_on: [], close_federal_holidays: true, ...oh } as never)}`;
    try {
      await set({ start_hour: "10:00", end_hour: 15 });
      expect(await meetings.workHours()).toMatchObject({ startHour: 10, endHour: 15 });
      await set({ start_hour: 16, end_hour: 9 });
      expect(await meetings.workHours()).toMatchObject({ startHour: 9, endHour: 17 });
    } finally {
      await set({});
    }
    expect(await meetings.workHours()).toMatchObject({ weekdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 });
    const broken = (() => Promise.reject(new Error("database is down"))) as never;
    await expect(meetings.workHours(broken)).rejects.toThrow(/database is down/);
  });
});
