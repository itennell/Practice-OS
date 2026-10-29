// One-paste Connect Cal.com (lib/frontdesk/calendar/calcom-setup.ts) against recorded
// and doc-shaped Cal.com responses (tests/fixtures/frontdesk/calcom-setup.ts). No network.
import { describe, expect, it } from "vitest";
import { autoConnectCalcom, bookingBlocker, CONSULT_LOCATION, CONSULT_SLUG, pickConsult } from "../lib/frontdesk/calendar/calcom-setup";
import { shortSlotLabel } from "../lib/frontdesk/calendar/zone";
import * as F from "./fixtures/frontdesk/calcom-setup";
import { fakeFetch, type Route } from "./helpers/fake-fetch";

const KEY = "cal_live_fake0123456789abcdef";
const NOW = new Date("2026-10-29T01:49:28Z"); // when Isaiah's spike ran

const routes = (over: Partial<Record<"me" | "schedule" | "list" | "create" | "slots", Route>> = {}): Route[] => [
  over.me ?? { match: "GET /me", json: F.me },
  over.schedule ?? { match: "GET /schedules/default", json: F.schedule },
  over.create ?? { match: "POST /event-types", status: 201, json: F.created },
  over.list ?? { match: "GET /event-types", json: F.list(F.isaiahConsult) },
  over.slots ?? { match: "GET /slots?", json: F.spikeSlots },
];

describe("pickConsult", () => {
  it("keeps the saved one, then ours, then a 15-minute consult; never a 30-minute one", () => {
    expect(pickConsult([F.intro30, F.isaiahConsult], 9001)?.id).toBe(9001);
    expect(pickConsult([F.isaiahConsult, F.ours])?.slug).toBe(CONSULT_SLUG);
    expect(pickConsult([F.intro30, F.isaiahConsult])?.id).toBe(7685541);
    expect(pickConsult([F.intro30, F.consult30])).toBeNull();
  });
});

describe("autoConnectCalcom", () => {
  it("Isaiah's real account: finds event 7685541, creates nothing, next open time Thu 9am", async () => {
    const f = fakeFetch(routes());
    const out = await autoConnectCalcom(KEY, { now: NOW, fetchImpl: f.impl });
    expect(out).toMatchObject({ ok: true, created: false, timeZone: "America/Chicago", eventType: { id: 7685541 } });
    if (!out.ok) throw new Error("expected ok");
    expect(shortSlotLabel(out.nextSlot!.start, out.timeZone)).toBe("Thu 9am");
    expect(f.calls.some((c) => c.method === "POST")).toBe(false);
    // Each call pins its documented cal-api-version and sends the key only as a Bearer header.
    const v = (path: string) => f.calls.find((c) => c.url.includes(path))!.headers["cal-api-version"];
    expect(v("/me")).toBeUndefined();
    expect(v("/schedules/default")).toBe("2024-06-11");
    expect(v("/event-types")).toBe("2026-06-12");
    expect(v("/slots?")).toBe("2024-09-04");
    expect(f.calls.every((c) => c.headers.authorization === `Bearer ${KEY}` && !c.url.includes(KEY))).toBe(true);
    const slots = new URL(f.calls.find((c) => c.url.includes("/slots?"))!.url).searchParams;
    expect([slots.get("eventTypeId"), slots.get("timeZone"), slots.get("format")]).toEqual(["7685541", "America/Chicago", "range"]);
  });

  it("near-miss (only 30-minute events): creates the 15-minute consult at the attendee's phone", async () => {
    const f = fakeFetch(routes({ list: { match: "GET /event-types", json: F.list(F.intro30, F.consult30) } }));
    const out = await autoConnectCalcom(KEY, { now: NOW, fetchImpl: f.impl });
    expect(out).toMatchObject({ ok: true, created: true, eventType: { slug: CONSULT_SLUG, lengthInMinutes: 15 } });
    const post = f.calls.find((c) => c.method === "POST")!;
    expect(post.headers["cal-api-version"]).toBe("2026-06-12");
    const body = JSON.parse(post.body!);
    // A location that needs nothing from the caller: Cal.com requires a phone for "attendeePhone".
    expect(body).toMatchObject({ title: "Free 15-minute consultation", slug: CONSULT_SLUG, lengthInMinutes: 15, locations: [CONSULT_LOCATION] });
    expect(JSON.stringify(body)).not.toMatch(/attendee|\+1\d{10}|"phone"/); // never a caller detail, never her own number
  });

  it("pasting twice never makes a duplicate: the second run finds the one the first made", async () => {
    const first = fakeFetch(routes({ list: { match: "GET /event-types", json: F.list(F.intro30) } }));
    expect(await autoConnectCalcom(KEY, { now: NOW, fetchImpl: first.impl })).toMatchObject({ ok: true, created: true });
    const second = fakeFetch(routes({ list: { match: "GET /event-types", json: F.list(F.intro30, F.ours) } }));
    expect(await autoConnectCalcom(KEY, { now: NOW, fetchImpl: second.impl })).toMatchObject({ ok: true, created: false, eventType: { id: 9003 } });
    expect(second.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("a taken slug (a lost first response) re-lists and uses the existing one", async () => {
    let lists = 0;
    const listRoute: Route = { match: "GET /event-types", json: F.list(F.intro30) };
    const f = fakeFetch([
      { match: "GET /me", json: F.me },
      { match: "GET /schedules/default", json: F.schedule },
      { match: "POST /event-types", status: 400, json: F.slugTaken },
      { ...listRoute, get json() { return ++lists === 1 ? F.list(F.intro30) : F.list(F.intro30, F.ours); } },
      { match: "GET /slots?", json: F.spikeSlots },
    ]);
    expect(await autoConnectCalcom(KEY, { now: NOW, fetchImpl: f.impl })).toMatchObject({ ok: true, eventType: { id: 9003 } });
  });

  it("each failure gets one plain fix", async () => {
    const run = (over: Parameters<typeof routes>[0], key = KEY) => autoConnectCalcom(key, { now: NOW, fetchImpl: fakeFetch(routes(over)).impl });
    expect(await run({}, "not-a-key")).toEqual({ ok: false, fix: expect.stringContaining("starts with cal_") });
    expect(await run({ me: { match: "GET /me", status: 401, json: {} } })).toEqual({ ok: false, fix: "That key didn't work. Copy it again from Cal.com and paste all of it." });
    expect(await run({ schedule: { match: "GET /schedules/default", json: F.noSchedule } })).toEqual({ ok: false, fix: expect.stringContaining("open Availability") });
    expect(
      await run({ list: { match: "GET /event-types", json: F.list(F.intro30) }, create: { match: "POST /event-types", status: 403, json: F.forbidden } }),
    ).toEqual({ ok: false, fix: expect.stringContaining("wouldn't add the consult") });
  });

  it("an event whose location is the caller's phone gets a plain fix, and Practice-OS never edits it", async () => {
    // Isaiah's real 7685541 (read-only GET, 2026-10-29): locations [{type: "attendeePhone"}], email required.
    const f = fakeFetch(routes({ list: { match: "GET /event-types", json: F.list(F.isaiahConsultLive) } }));
    const out = await autoConnectCalcom(KEY, { now: NOW, fetchImpl: f.impl });
    expect(out).toEqual({ ok: false, fix: expect.stringMatching(/^In Cal.com, open "Free 15-Minute Consultation", go to Location/) });
    expect(f.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("bookingBlocker allows name, email and title, and flags any other required question", () => {
    expect(bookingBlocker(F.isaiahConsultFixed)).toBeNull();
    expect(bookingBlocker({ ...F.isaiahConsultFixed, bookingFields: [{ slug: "insurance", required: true, hidden: false }] })).toMatch(/make the "insurance" question optional/);
    expect(bookingBlocker({ ...F.isaiahConsultFixed, bookingFields: [{ slug: "insurance", required: true, hidden: true }] })).toBeNull();
  });

  it("returns her own Cal.com email for bookings, never a caller's", async () => {
    const out = await autoConnectCalcom(KEY, { now: NOW, fetchImpl: fakeFetch(routes()).impl });
    expect(out).toMatchObject({ ok: true, ownerEmail: "dana@example.com" });
  });

  it("no open times this week still connects, with no next time", async () => {
    const out = await autoConnectCalcom(KEY, { now: NOW, fetchImpl: fakeFetch(routes({ slots: { match: "GET /slots?", json: F.noSlots } })).impl });
    expect(out).toMatchObject({ ok: true, nextSlot: null });
  });
});
