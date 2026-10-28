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
const { getSource, moveDueFollowUps } = await import("../lib/referrals/store");
const { practiceToday } = await import("../lib/compliance/store");

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

  it("DRY_RUN: approving shows the draft to the test inbox, moves the card and sets a follow-up 7 days out", async () => {
    process.env.DRY_RUN = "true";
    const sourceId = await makeSource();
    const id = await draft(sourceId);
    const res = await approve(id, { by: "test" });
    expect(res.ok && res.approval.status).toBe("done");
    const result = res.ok ? (res.approval.result as Record<string, unknown>) : {};
    expect(result).toMatchObject({ dry_run: true, gmail_draft_id: null, moved_to: "contacted" });
    expect(result.draft).toEqual({ to: "test-inbox@example.com", subject: "Introduction from Reyes Counseling", body: LETTER });

    const today = await practiceToday();
    const due = new Date(`${today}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 7);
    const card = (await getSource(sourceId))!;
    expect(card.stage).toBe("contacted");
    expect(card.next_follow_up_on).toBe(due.toISOString().slice(0, 10));
    const actions = (await db()`select action from practice_os.audit_log where approval_id = ${id} order by id`).map((r) => r.action);
    expect(actions).toEqual(["approval_queued", "approval_approved", "referral_letter_dry_run", "approval_done"]);
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

  it("for real (DRY_RUN=false) without Google connected: fails with the Connect step, nothing moves", async () => {
    process.env.DRY_RUN = "false";
    const sourceId = await makeSource();
    const id = await draft(sourceId);
    const res = await approve(id, { by: "test" });
    expect(res.ok && res.approval.status).toBe("failed");
    expect(res.ok && res.approval.error).toMatch(/Connect Google first/);
    expect((await getSource(sourceId))!.stage).toBe("found");
  });

  it("moves a Contacted card to Follow up once its day comes", async () => {
    const sourceId = await makeSource();
    await db()`update practice_os.referral_sources set stage = 'contacted', next_follow_up_on = current_date - 1 where id = ${sourceId}`;
    expect(await moveDueFollowUps()).toBeGreaterThanOrEqual(1);
    expect((await getSource(sourceId))!.stage).toBe("follow_up");
  });
});
