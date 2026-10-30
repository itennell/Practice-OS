// The contact log on each Referrals card, the way a solo therapist keeps one:
// what she did and when (called, emailed, met, sent the letter, they replied,
// a note, they referred someone), who introduced her, and the next follow-up.
// The log moves the tier (relationship modifiers in referral-tiers.json) and
// the follow-ups reach the morning brief. "They referred someone" keeps a date
// only: under 740 ILCS 110 even confirming someone is a client is protected,
// and the database refuses a note on that row (migration 024).
import type postgres from "postgres";
import { guard, REFUSAL } from "../aeon/guard";
import { audit } from "../audit";
import { practiceToday } from "../compliance/store";
import { db } from "../db";
import { CONTACT_KINDS, type ContactKind } from "./contact-kinds";
import type { Stage } from "./stages";

export { CONTACT_KINDS, CONTACT_LABEL, REFERRED_NOTE, type ContactKind } from "./contact-kinds";

/** Reaching out: sets "last contacted" and, unless she picks a date, a follow-up a week out. */
const OUTREACH: ContactKind[] = ["called", "emailed", "sent_letter"];
export const FOLLOW_UP_DAYS = 7;

export type Contact = {
  id: string;
  source_id: string;
  kind: ContactKind;
  happened_on: string;
  note: string | null;
  created_by: "clinician" | "aeon";
  is_sample: boolean;
};



export type LogInput = {
  kind: ContactKind;
  /** YYYY-MM-DD; today when left out. */
  happenedOn?: string | null;
  note?: string | null;
  /** YYYY-MM-DD for the next follow-up; null clears it; left out uses the default for the kind. */
  followUpOn?: string | null;
  by: "clinician" | "aeon";
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A plain-words error for her, or null when the note may be saved. */
export async function checkNote(note: string, check = (t: string) => guard(t, "message")): Promise<string | null> {
  const r = await check(note);
  return r.ok ? null : REFUSAL[r.kind];
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Saves one log entry and its bookkeeping on the card. Throws in plain words. */
export async function logContact(
  sourceId: string,
  input: LogInput,
  sql: postgres.Sql = db(),
  check?: (t: string) => ReturnType<typeof guard>,
): Promise<{ contact: Contact; stage: Stage; nextFollowUpOn: string | null }> {
  if (!CONTACT_KINDS.includes(input.kind)) throw new Error("Unknown kind of contact.");
  const today = await practiceToday(sql);
  const happenedOn = input.happenedOn ?? today;
  if (!DATE.test(happenedOn) || happenedOn > today) throw new Error("Pick a date that isn't in the future.");
  let note = input.note?.trim() || null;
  if (input.kind === "referred") note = null; // a date only, never who
  if (note) {
    if (note.length > 500) throw new Error("Keep the note under 500 characters.");
    const refused = await checkNote(note, check);
    if (refused) throw new Error(refused);
  }
  if (input.followUpOn && (!DATE.test(input.followUpOn) || input.followUpOn < today)) throw new Error("Pick a follow-up date from today on.");

  const [card] = await sql<{ stage: Stage; next_follow_up_on: string | null }[]>`
    select stage, next_follow_up_on::text as next_follow_up_on from practice_os.referral_sources where id = ${sourceId}`;
  if (!card) throw new Error("That referral source is no longer on the board.");

  // Where the card goes: reaching out moves Found to Contacted; a reply, a meeting
  // or a referral means you're connected. Not a fit stays put.
  let stage = card.stage;
  if (stage !== "not_a_fit") {
    if (["replied", "met", "referred"].includes(input.kind)) stage = "connected";
    else if (OUTREACH.includes(input.kind) && (stage === "found" || stage === "follow_up")) stage = "contacted";
  }
  let next = card.next_follow_up_on;
  if (input.followUpOn !== undefined) next = input.followUpOn;
  else if (OUTREACH.includes(input.kind)) next = addDays(happenedOn, FOLLOW_UP_DAYS);
  else if (input.kind === "replied" || input.kind === "met") next = null;

  const contact = await sql.begin(async (tx) => {
    const [row] = await tx<Contact[]>`
      insert into practice_os.referral_contacts (source_id, kind, happened_on, note, created_by)
      values (${sourceId}, ${input.kind}, ${happenedOn}, ${note}, ${input.by})
      returning id, source_id, kind, happened_on::text as happened_on, note, created_by, is_sample`;
    await tx`
      update practice_os.referral_sources
         set stage = ${stage}, next_follow_up_on = ${next},
             last_contacted_at = case when ${OUTREACH.includes(input.kind) || input.kind === "met"}
               then greatest(coalesce(last_contacted_at, ${happenedOn}::timestamptz), ${happenedOn}::timestamptz) else last_contacted_at end,
             updated_at = now()
       where id = ${sourceId}`;
    return row;
  });
  // The audit keeps the kind and date, never the note's words.
  await audit(
    { actor: input.by, action: "referral_contact_logged", subjectType: "referral_source", subjectId: sourceId, details: { kind: input.kind, on: happenedOn, stage, next } },
    sql,
  );
  return { contact, stage, nextFollowUpOn: next };
}

export async function contactsFor(sourceIds: string[], sql: postgres.Sql = db()): Promise<Record<string, Contact[]>> {
  if (sourceIds.length === 0) return {};
  const rows = await sql<Contact[]>`
    select id, source_id, kind, happened_on::text as happened_on, note, created_by, is_sample
      from practice_os.referral_contacts where source_id in ${sql(sourceIds)}
     order by happened_on desc, created_at desc`;
  const out: Record<string, Contact[]> = {};
  for (const r of rows) (out[r.source_id] ??= []).push(r);
  return out;
}

export async function deleteContact(id: string, sql: postgres.Sql = db()): Promise<boolean> {
  const [row] = await sql<{ source_id: string; kind: string }[]>`delete from practice_os.referral_contacts where id = ${id} returning source_id, kind`;
  if (row) await audit({ actor: "clinician", action: "referral_contact_deleted", subjectType: "referral_source", subjectId: row.source_id, details: { kind: row.kind } }, sql);
  return Boolean(row);
}

/** Who introduced her (a colleague, never a client). Null clears it. */
export async function setIntroducedBy(sourceId: string, who: string | null, sql: postgres.Sql = db(), check?: (t: string) => ReturnType<typeof guard>) {
  const text = who?.trim() || null;
  if (text) {
    if (text.length > 120) throw new Error("Keep it under 120 characters.");
    const refused = await checkNote(text, check);
    if (refused) throw new Error(refused);
  }
  await sql`update practice_os.referral_sources set introduced_by = ${text}, updated_at = now() where id = ${sourceId}`;
  await audit({ actor: "clinician", action: "referral_intro_set", subjectType: "referral_source", subjectId: sourceId, details: { set: Boolean(text) } }, sql);
}

export async function setFollowUp(sourceId: string, on: string | null, sql: postgres.Sql = db()) {
  const today = await practiceToday(sql);
  if (on && (!DATE.test(on) || on < today)) throw new Error("Pick a follow-up date from today on.");
  await sql`update practice_os.referral_sources set next_follow_up_on = ${on}, updated_at = now() where id = ${sourceId}`;
}

/** What the log says about the relationship, for the tier and the card. */
export type Relationship = {
  warmIntro: boolean;
  referredBefore: boolean;
  referredCount: number;
  met: boolean;
  replied: boolean;
  /** The latest call, email, letter or meeting. */
  lastContactOn: string | null;
};

export function relationshipFrom(contacts: Pick<Contact, "kind" | "happened_on">[], introducedBy: string | null): Relationship {
  const has = (k: ContactKind) => contacts.some((c) => c.kind === k);
  const reach = contacts.filter((c) => [...OUTREACH, "met"].includes(c.kind)).map((c) => c.happened_on).sort();
  return {
    warmIntro: Boolean(introducedBy),
    referredBefore: has("referred"),
    referredCount: contacts.filter((c) => c.kind === "referred").length,
    met: has("met"),
    replied: has("replied"),
    lastContactOn: reach.at(-1) ?? null,
  };
}

// ---- do not contact ---------------------------------------------------------

export type SuppressReason = "asked_not_to" | "not_interested";

/** Never suggest this NPI again, and move its card to Not a fit. */
export async function suppress(sourceId: string, reason: SuppressReason, sql: postgres.Sql = db()) {
  const [card] = await sql<{ npi: string | null }[]>`
    update practice_os.referral_sources set stage = 'not_a_fit', next_follow_up_on = null, updated_at = now()
     where id = ${sourceId} returning npi`;
  if (!card) throw new Error("That referral source is no longer on the board.");
  if (card.npi) await sql`insert into practice_os.referral_suppressions (npi, reason) values (${card.npi}, ${reason}) on conflict (npi) do update set reason = excluded.reason`;
  await audit({ actor: "clinician", action: "referral_suppressed", subjectType: "referral_source", subjectId: sourceId, details: { reason } }, sql);
}

export async function unsuppress(sourceId: string, sql: postgres.Sql = db()) {
  const [card] = await sql<{ npi: string | null }[]>`select npi from practice_os.referral_sources where id = ${sourceId}`;
  if (card?.npi) await sql`delete from practice_os.referral_suppressions where npi = ${card.npi}`;
  await audit({ actor: "clinician", action: "referral_unsuppressed", subjectType: "referral_source", subjectId: sourceId }, sql);
}

export async function suppressedNpis(sql: postgres.Sql = db()): Promise<Set<string>> {
  const rows = await sql<{ npi: string }[]>`select npi from practice_os.referral_suppressions`;
  return new Set(rows.map((r) => r.npi));
}
