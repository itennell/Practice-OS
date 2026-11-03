// A crisis in a note on a referral card routes like the chat (lib/referrals/contacts.ts checkNote):
// crisis_detected, the urgent alert or, with phone alerts off, the urgent item at the top of Admin.
// A note that names one of the office's own services ("a suicide prevention program") is a partner
// fact and doesn't route. Fictional offices only.
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { checkCrisis, checkNoteCrisis } from "../lib/safety";
import { loadEnv } from "../lib/env";
loadEnv();

// Facts about the partner's office: never route.
const OFFICE_FACTS = [
  "Their office runs a suicide prevention program",
  "They have a self-harm IOP",
  "They run a suicide loss support group for families.",
  "They have a self-harm clinic on Tuesdays.",
  "Their staff did a suicide prevention training last month.",
  "They have an eating disorder and self-harm group.",
  "Their suicide attempt survivors group meets Mondays.",
  "Their self-injury program takes referrals by fax.",
  // #144 review: an "and" before the qualifier, and an office phrase about who they serve.
  "Self-harm and suicide prevention training for nurses quarterly.",
  "Hospice bereavement team; refers families after a suicide loss to our group.",
];
// About a person, or ambiguous: always route.
const ROUTES = [
  // Ambiguous, so it routes: "they" may be a patient who isn't safe at home, and a missed crisis is far worse than a false alarm.
  "front desk said they're not safe at home",
  "One of their clients self-harms.",
  "Their patient talked about suicide last week.",
  "The self-harm IOP said their patient wants to kill herself.",
  "Their self-harm program is full and a client is cutting again.",
  "She is in their suicide prevention program after an attempt last night.",
  "Their suicide prevention program called because someone wants to end it all.",
  "They have a self-harm group, and he said he wants to die.",
  // #144 review: the service word is the only crisis cue, but a person is in the note. Default refuse.
  "Joe needs their suicide attempt program tonight",
  "Maria: suicidal group asap",
  "my sister needs the self harm clinic tonight",
  "my husband needs their suicide prevention services, now",
  "Dana's brother: suicide attempt survivors group, he has pills saved",
  "the veteran from church needs their suicide prevention team today",
  "suicide attempt group. mom tried again yesterday",
  "Ana self harm IOP intake, cutting again",
  "my wife suicide prevention program",
  "suicide group for Sam",
  "Mike suicide attempt program",
  "joe suicide program now",
  "suicide attempt survivors group joined by Leo after his attempt",
  // And with an office-fact word next to a person cue.
  "They run a suicide prevention program and Joe is in it",
  "Their self-harm group meets weekly, my nephew goes",
  "They offer a suicide loss group, I need it tonight",
  "Staff runs the self-harm IOP for Sam",
  "They have a suicide attempt program; she tried again",
];
// Read in any note, whatever else it says.
const ALWAYS = ["Their IOP takes referrals; a teen is cutting again", "They have a group. Tried again last week.", "Weekly group; he has pills saved"];

describe("the note crisis check", () => {
  it.each(OFFICE_FACTS)("a fact about the office doesn't route: %s", (note) => {
    expect(checkNoteCrisis(note).crisis).toBe(false);
  });
  it.each(ROUTES)("routes: %s", (note) => {
    expect(checkNoteCrisis(note).crisis).toBe(true);
  });
  it.each(ALWAYS)("always routes: %s", (note) => {
    expect(checkNoteCrisis(note).crisis).toBe(true);
  });
  it("every line of the crisis corpus that must route still routes as a note", async () => {
    const { MUST_ROUTE, MUST_ROUTE_AS } = await import("./fixtures/crisis-corpus");
    const missed = [...MUST_ROUTE, ...MUST_ROUTE_AS.map(([t]) => t)].filter((t) => !checkNoteCrisis(t).crisis);
    expect(missed).toEqual([]);
  });
  it("outside notes the check is unchanged: the same office fact still routes in the chat", () => {
    expect(checkCrisis("They have a self-harm IOP").crisis).toBe(true);
  });
  it("the demo script routes nothing, read as a message or as a note", () => {
    const lines = readFileSync(new URL("../docs/demo-script.md", import.meta.url), "utf8").split("\n").filter((l) => l.trim());
    expect(lines.filter((l) => checkCrisis(l).crisis || checkNoteCrisis(l).crisis)).toEqual([]);
  });
});

describe("a crisis typed in a card note", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { checkNote, CRISIS_NOTE } = await import("../lib/referrals/contacts");
  const { loadAlertFailures } = await import("../lib/admin/load");
  const sql = db();
  afterAll(async () => {
    await closeDb();
  });

  it("is refused and routes like the chat: crisis_detected and the urgent Admin item", async () => {
    const since = new Date();
    const refused = await checkNote("Their patient said she wants to kill herself.", async () => ({ ok: true, text: "" }) as never, { by: "test:note" });
    expect(refused).toBe(CRISIS_NOTE);
    const rows = await sql<{ action: string; subject_type: string; details: Record<string, unknown> }[]>`
      select action, subject_type, details from practice_os.audit_log where at >= ${since} and actor = 'safety' order by at`;
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["crisis_note_refused", "crisis_detected", "crisis_alert_failed"]));
    const detected = rows.find((r) => r.action === "crisis_detected")!;
    expect(detected.subject_type).toBe("referral_note");
    // The words never reach the audit row.
    expect(JSON.stringify(rows)).not.toContain("kill");
    const failures = await loadAlertFailures(sql);
    const failed = rows.find((r) => r.action === "crisis_alert_failed");
    expect(failed).toBeTruthy();
    expect(failures.length).toBeGreaterThan(0);
  });

  it("a fact about the office's own program is saved and doesn't route", async () => {
    const since = new Date();
    const refused = await checkNote("Their office runs a suicide prevention program.", async () => ({ ok: true, text: "" }) as never);
    expect(refused).toBeNull();
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from practice_os.audit_log where at >= ${since} and action = 'crisis_detected'`;
    expect(n).toBe(0);
  });

  it("a note screened again for a letter isn't a new crisis event", async () => {
    const since = new Date();
    await checkNote("Their patient said she wants to kill herself.", async () => ({ ok: true, text: "" }) as never, { audit: false });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from practice_os.audit_log where at >= ${since} and action = 'crisis_detected'`;
    expect(n).toBe(0);
  });
});
