// Referral letters against the live database: the approval gate, the executor
// in DRY_RUN, and the refusals. Runs only when DATABASE_URL is set. Muse is a
// stand-in here (no model calls); each test's rows are deleted after.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { approve } = await import("../lib/approvals");
const { closeDb, db } = await import("../lib/db");
const { draftOutreach } = await import("../lib/referrals/outreach");
const { addToBoard, getSource, latestLetters, moveDueFollowUps, rescoreOldCards } = await import("../lib/referrals/store");
const { practiceToday } = await import("../lib/compliance/store");
const { getReferralSettings, saveReferralSettings } = await import("../lib/referrals/settings");
const { referralsQuestions } = await import("../lib/referrals/onboarding");

const LETTER =
  "Dear Dr. Rivera,\n\nI'm Dana Reyes, a licensed clinical professional counselor in Lincoln Park. I work with adults " +
  "navigating anxiety, life transitions and stress at work, in person and by video. Since your family medicine practice " +
  "is just down the street, I'd love to introduce myself. Would you be open to a 15-minute call in the next few weeks " +
  "to talk about how we might work together?\n\nWarmly,\nDana Reyes, LCPC\nReyes Counseling PLLC";

const fakeChat = (async () => ({
  choices: [{ message: { content: JSON.stringify({ subject: "Introduction from Reyes Counseling", letter: LETTER }) } }],
})) as never;

const sources: string[] = [];
const approvals: string[] = [];
let savedDryRun: string | undefined;
let savedInbox: string | undefined;
let savedSetup: { home_zip: string | null; specialties: string[] } | null | undefined;

async function makeSource() {
  const npi = `19${String(Date.now() + sources.length).slice(-8)}`;
  const [row] = await db()`
    insert into practice_os.referral_sources (npi, name, taxonomy, specialty, npi_type, city, state, zip, distance_miles, fit_score)
    values (${npi}, 'Maria Rivera, MD', '207Q00000X', 'Family medicine', 'individual', 'Chicago', 'IL', '60614', 0.2, 97)
    returning id`;
  sources.push(row.id);
  return row.id as string;
}

async function draft(sourceId: string) {
  const { approvalId } = await draftOutreach(sourceId, { by: "test", chat: fakeChat });
  approvals.push(approvalId);
  return approvalId;
}

beforeAll(() => {
  savedDryRun = process.env.DRY_RUN;
  savedInbox = process.env.TEST_INBOX_EMAIL;
  process.env.TEST_INBOX_EMAIL = "test-inbox@example.com";
});

afterAll(async () => {
  process.env.DRY_RUN = savedDryRun;
  process.env.TEST_INBOX_EMAIL = savedInbox;
  if (!hasDb) return;
  // Put her Referrals setup back exactly as it was.
  if (savedSetup === null) await db()`delete from practice_os.referral_settings`;
  else if (savedSetup) await db()`update practice_os.referral_settings set home_zip = ${savedSetup.home_zip}, specialties = ${savedSetup.specialties}`;
  if (approvals.length) await db()`delete from practice_os.approvals where id in ${db()(approvals)}`;
  if (sources.length) await db()`delete from practice_os.referral_sources where id in ${db()(sources)}`;
  await closeDb();
});

describe.skipIf(!hasDb)("referral letters", () => {
  it("waits for her: drafting queues a pending referral_letter and changes nothing on the board", async () => {
    const sourceId = await makeSource();
    const id = await draft(sourceId);
    const [row] = await db()`select kind, status, preview, payload from practice_os.approvals where id = ${id}`;
    expect(row).toMatchObject({ kind: "referral_letter", status: "pending" });
    expect(row.payload).toMatchObject({ referral_source_id: sourceId, letter: LETTER });
    expect(row.preview.body).toBe(LETTER);
    expect((await getSource(sourceId))!.stage).toBe("found");
  });

  it("approving sends nothing: it keeps the letter to copy, moves the card and sets a follow-up 7 days out", async () => {
    process.env.DRY_RUN = "true";
    const sourceId = await makeSource();
    const id = await draft(sourceId);
    const res = await approve(id, { by: "test" });
    expect(res.ok && res.approval.status).toBe("done");
    const result = res.ok ? (res.approval.result as Record<string, unknown>) : {};
    expect(result).toMatchObject({ dry_run: true, moved_to: "contacted" });
    expect(result.letter).toEqual({ subject: "Introduction from Reyes Counseling", body: LETTER });
    expect(result).not.toHaveProperty("gmail_draft_id");

    const today = await practiceToday();
    const due = new Date(`${today}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 7);
    const card = (await getSource(sourceId))!;
    expect(card.stage).toBe("contacted");
    expect(card.next_follow_up_on).toBe(due.toISOString().slice(0, 10));
    const actions = (await db()`select action from practice_os.audit_log where approval_id = ${id} order by id`).map((r) => r.action);
    expect(actions).toEqual(["approval_queued", "approval_approved", "referral_letter_approved", "approval_done"]);
  });

  it("refuses an edit that offers something of value, and leaves the card where it was", async () => {
    process.env.DRY_RUN = "true";
    const sourceId = await makeSource();
    const id = await draft(sourceId);
    const res = await approve(id, { by: "test", edit: `${LETTER}\n\nP.S. Lunch is on me, and a $25 gift card for each referral!` });
    expect(res.ok && res.approval.status).toBe("failed");
    expect(res.ok && res.approval.error).toMatch(/can't offer or discuss anything of value/);
    expect((await getSource(sourceId))!.stage).toBe("found");
  });

  it("for real (DRY_RUN=false) it still needs no Google: no Gmail call, the card moves", async () => {
    process.env.DRY_RUN = "false";
    const sourceId = await makeSource();
    const id = await draft(sourceId);
    const res = await approve(id, { by: "test" });
    expect(res.ok && res.approval.status).toBe("done");
    expect((await getSource(sourceId))!.stage).toBe("contacted");
    const letters = await latestLetters();
    expect(letters[sourceId]).toMatchObject({ approvalId: id, status: "done", subject: "Introduction from Reyes Counseling", letter: LETTER });
  });

  it("moves a Contacted card to Follow up once its day comes", async () => {
    const sourceId = await makeSource();
    await db()`update practice_os.referral_sources set stage = 'contacted', next_follow_up_on = current_date - 1 where id = ${sourceId}`;
    expect(await moveDueFollowUps()).toBeGreaterThanOrEqual(1);
    expect((await getSource(sourceId))!.stage).toBe("follow_up");
  });
});

describe.skipIf(!hasDb)("Add to board", () => {
  it("saves each NPI once, as soon as it is found, and keeps going when one lookup fails", async () => {
    const base = Date.now() % 1e8;
    const ok1 = `18${String(base).padStart(8, "0")}`;
    const ok2 = `18${String(base + 1).padStart(8, "0")}`;
    const bad = `18${String(base + 2).padStart(8, "0")}`;
    let lookups = 0;
    const lookup = async (npi: string) => {
      lookups++;
      if (npi === bad) throw new Error("NPPES timed out");
      return {
        npi, name: `[Sample] Test ${npi}`, organization: null, practiceName: null, npiType: "individual" as const, credential: "MD",
        taxonomy: "207Q00000X", taxonomyLabel: "Family Medicine", specialty: "family_medicine" as const, specialtyLabel: "Family medicine",
        address: "100 W Example St", city: "Chicago", state: "IL", zip: "60614", phone: null, fax: null, official: null, lastUpdated: null,
      };
    };
    const { added, missing } = await addToBoard(
      [{ npi: ok1, distanceMiles: 0.5 }, { npi: ok1, distanceMiles: 0.5 }, { npi: bad, distanceMiles: 1 }, { npi: ok2, distanceMiles: 2 }],
      db(),
      lookup,
    );
    for (const a of added) sources.push(a.id!);
    expect(lookups).toBe(3);
    expect(added.map((a) => a.npi)).toEqual([ok1, ok2]);
    expect(missing).toEqual([bad]);
  });
});

describe.skipIf(!hasDb)("score versions", () => {
  it("scores cards from an older formula again and marks them current", async () => {
    const id = await makeSource();
    await db()`update practice_os.referral_sources set score_version = 1, fit_score = 3 where id = ${id}`;
    await rescoreOldCards(db(), async () => null, 500);
    const card = (await getSource(id))!;
    expect(card.score_version).toBe(2);
    expect(card.fit_score).toBeGreaterThan(3);
  });
});

describe.skipIf(!hasDb)("Referrals setup (onboarding)", () => {
  it("asks the ZIP only without an office ZIP, prefills, saves, and the search falls back to it", async () => {
    const [row] = await db()`select home_zip, specialties from practice_os.referral_settings`;
    savedSetup = row ? { home_zip: row.home_zip, specialties: row.specialties } : null;

    const zipQ = referralsQuestions.questions.find((q) => q.id === "home_zip")!;
    const basics = (officeZip: string | null) => ({ state: "IL", credential: "LCPC", practiceStage: "beginning", officeZip, telehealth: false }) as const;
    expect(zipQ.appliesWhen!(basics("60614"))).toBe(false);
    expect(Object.keys(zipQ)).not.toContain("appliesWhen"); // functions can't reach the onboarding page's client component
    expect(zipQ.appliesWhen!(basics(null))).toBe(true);

    await db()`delete from practice_os.referral_settings`;
    expect(await referralsQuestions.load(basics("60657"))).toEqual({ home_zip: "60657", specialties: ["family_medicine", "internal_medicine"] });

    await referralsQuestions.save({ specialties: ["oncology", "pediatrics"] });
    await referralsQuestions.save({ home_zip: "60610" });
    const setup = await getReferralSettings();
    expect(setup).toMatchObject({ homeZip: "60610", searchZip: "60610", specialties: ["oncology", "pediatrics"] });

    await expect(referralsQuestions.save({ home_zip: "6061" })).rejects.toThrow("Type your 5-digit ZIP code.");
    await expect(referralsQuestions.save({ specialties: ["dentists"] })).rejects.toThrow("Pick from the list.");
    await saveReferralSettings({ homeZip: null });
    expect((await getReferralSettings()).homeZip).toBeNull();
  });
});
