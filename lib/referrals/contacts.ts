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
import { keyMatches, orgKeyOf, type OrgKey, type Suppressed } from "./dnc-key";
import type { Stage } from "./stages";

export { CONTACT_KINDS, CONTACT_LABEL, REFERRED_NOTE, REFERRED_OUT_NOTE, type ContactKind } from "./contact-kinds";
export { isSuppressed, type Suppressed } from "./dnc-key";

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
  /** referred_out only: how many people she referred to them. Never who. */
  people_count?: number | null;
};



export type LogInput = {
  kind: ContactKind;
  /** YYYY-MM-DD; today when left out. */
  happenedOn?: string | null;
  note?: string | null;
  /** YYYY-MM-DD for the next follow-up; null clears it; left out uses the default for the kind. */
  followUpOn?: string | null;
  by: "clinician" | "aeon";
  /** referred_out only: how many people (1 to 20). Nothing else about them is ever kept. */
  count?: number | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day written YYYY-MM-DD: "2026-13-01" and "2026-02-31" are not. */
export function isDay(v: string): boolean {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const notADay = (v: string, what: string) => new Error(`"${v.slice(0, 40)}" isn't a date I can read. Pick a real day for ${what}, written like 2026-11-09.`);

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
  if (!isDay(happenedOn)) throw notADay(happenedOn, "when it happened");
  if (happenedOn > today) throw new Error("Pick a date that isn't in the future.");
  let note = input.note?.trim() || null;
  if (input.kind === "referred" || input.kind === "referred_out") note = null; // a date only, never who
  let count: number | null = null;
  if (input.kind === "referred_out") {
    count = input.count ?? 1;
    if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Say how many people, from 1 to 20.");
  }
  if (note) {
    if (note.length > 500) throw new Error("Keep the note under 500 characters.");
    const refused = await checkNote(note, check);
    if (refused) throw new Error(refused);
  }
  if (input.followUpOn && !isDay(input.followUpOn)) throw notADay(input.followUpOn, "the follow-up");
  if (input.followUpOn && input.followUpOn < today) throw new Error("Pick a follow-up date from today on.");

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
      insert into practice_os.referral_contacts (source_id, kind, happened_on, note, created_by, people_count)
      values (${sourceId}, ${input.kind}, ${happenedOn}, ${note}, ${input.by}, ${count})
      returning id, source_id, kind, happened_on::text as happened_on, note, created_by, is_sample, people_count`;
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
    { actor: input.by, action: "referral_contact_logged", subjectType: "referral_source", subjectId: sourceId, details: { kind: input.kind, on: happenedOn, stage, next, ...(count ? { count } : {}) } },
    sql,
  );
  return { contact, stage, nextFollowUpOn: next };
}

export async function contactsFor(sourceIds: string[], sql: postgres.Sql = db()): Promise<Record<string, Contact[]>> {
  if (sourceIds.length === 0) return {};
  const rows = await sql<Contact[]>`
    select id, source_id, kind, happened_on::text as happened_on, note, created_by, is_sample, people_count
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
  if (on && !isDay(on)) throw notADay(on, "the follow-up");
  if (on && on < today) throw new Error("Pick a follow-up date from today on.");
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

type DncCard = { npi: string | null; name: string; organization: string | null; npi_type: "individual" | "organization" | null; address: string | null; city: string | null; zip: string | null };

async function dncCard(sourceId: string, sql: postgres.Sql): Promise<DncCard | undefined> {
  const [card] = await sql<DncCard[]>`
    select npi, name, organization, npi_type, address, city, zip from practice_os.referral_sources where id = ${sourceId}`;
  return card;
}

/**
 * Never suggest this provider again, and move its card to Not a fit. A card
 * with an NPI is listed by NPI (so a new search skips them); one without (a
 * hospice, a church, someone she added by hand) by its org key: the
 * normalized name and street, or city (lib/referrals/dnc-key.ts, migration 045).
 */
export async function suppress(sourceId: string, reason: SuppressReason, sql: postgres.Sql = db(), by: "clinician" | "aeon" = "clinician") {
  const found = await dncCard(sourceId, sql);
  if (!found) throw new Error("That referral source is no longer on the board.");
  const key = found.npi ? null : orgKeyOf(found);
  if (!found.npi && !key) {
    throw new NoNpiToList("This card has no name I can list, so I can't add it to your do-not-contact list. Move it to Not a fit yourself, or delete the card.");
  }
  // A letter to them still waiting for her approval is declined with it, so Approvals never offers to write to someone on the list.
  const declined = (await sql.begin(async (tx) => {
    await tx`update practice_os.referral_sources set stage = 'not_a_fit', next_follow_up_on = null, updated_at = now() where id = ${sourceId}`;
    if (found.npi) {
      await tx`insert into practice_os.referral_suppressions (npi, reason) values (${found.npi}, ${reason}) on conflict (npi) do update set reason = excluded.reason`;
    } else if (key) {
      await tx`
        insert into practice_os.referral_suppressions_org (org_key, name_key, street_key, city_key, reason)
        values (${key.org_key}, ${key.name_key}, ${key.street_key}, ${key.city_key}, ${reason})
        on conflict (org_key) do update set reason = excluded.reason`;
    }
    const rows = await tx<{ id: string }[]>`
      update practice_os.approvals
         set status = 'rejected', decided_at = now(), decided_by = ${by === "aeon" ? "aeon:do_not_contact" : "clinician:do_not_contact"}
       where kind = 'referral_letter' and status = 'pending' and payload ->> 'referral_source_id' = ${sourceId}
      returning id`;
    return rows.map((r) => r.id);
  })) as string[];
  await audit(
    { actor: by, action: "referral_suppressed", subjectType: "referral_source", subjectId: sourceId, details: { reason, by: found.npi ? "npi" : "org_key", letters_declined: declined.length } },
    sql,
  );
  for (const id of declined) {
    await audit({ actor: by, action: "approval_declined", approvalId: id, subjectType: "referral_letter", subjectId: sourceId, details: { why: "do_not_contact", reason } }, sql);
  }
  return { declined };
}

/** Kept so callers that catch it still compile; only a card with no usable name throws it now. */
export class NoNpiToList extends Error {}

async function orgRows(sql: postgres.Sql): Promise<(OrgKey & { reason: SuppressReason })[]> {
  return sql<(OrgKey & { reason: SuppressReason })[]>`
    select org_key, name_key, street_key, city_key, reason from practice_os.referral_suppressions_org`;
}

/** Why this card is on her do-not-contact list, or null when it isn't. */
export async function suppressionFor(sourceId: string, sql: postgres.Sql = db()): Promise<SuppressReason | null> {
  const card = await dncCard(sourceId, sql);
  if (!card) return null;
  if (card.npi) {
    const [row] = await sql<{ reason: SuppressReason }[]>`select reason from practice_os.referral_suppressions where npi = ${card.npi}`;
    if (row) return row.reason;
  }
  const key = orgKeyOf(card);
  if (!key) return null;
  return (await orgRows(sql)).find((o) => keyMatches(key, o))?.reason ?? null;
}

export async function unsuppress(sourceId: string, sql: postgres.Sql = db(), by: "clinician" | "aeon" = "clinician") {
  const card = await dncCard(sourceId, sql);
  if (card?.npi) await sql`delete from practice_os.referral_suppressions where npi = ${card.npi}`;
  const key = card ? orgKeyOf(card) : null;
  if (key) {
    const gone = (await orgRows(sql)).filter((o) => keyMatches(key, o)).map((o) => o.org_key);
    if (gone.length) await sql`delete from practice_os.referral_suppressions_org where org_key in ${sql(gone)}`;
  }
  await audit({ actor: by, action: "referral_unsuppressed", subjectType: "referral_source", subjectId: sourceId }, sql);
}

/** Her whole do-not-contact list: NPIs and org keys. Every search, the plan, letters and the debrief use it. */
export async function suppressedList(sql: postgres.Sql = db()): Promise<Suppressed> {
  const [npis, orgs] = await Promise.all([suppressedNpis(sql), orgRows(sql).catch(() => [] as OrgKey[])]);
  return { npis, orgs: orgs.map(({ org_key, name_key, street_key, city_key }) => ({ org_key, name_key, street_key, city_key })) };
}

/** A note from her log, screened again with the chat's full privacy check before it reaches the model or a tool result. Null when held back. */
export async function screenedNote(note: string | null, check?: (t: string) => ReturnType<typeof guard>): Promise<string | null> {
  if (!note) return null;
  return (await checkNote(note, check).catch(() => "unavailable")) === null ? note : null;
}

export async function suppressedNpis(sql: postgres.Sql = db()): Promise<Set<string>> {
  const rows = await sql<{ npi: string }[]>`select npi from practice_os.referral_suppressions`;
  return new Set(rows.map((r) => r.npi));
}
