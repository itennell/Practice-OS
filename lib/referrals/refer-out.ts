// Referring out: "I referred someone to them" on a card (a date and how many
// people, nothing else: the referred_out kind, migration 045/046) and her notes
// about the people she refers to (their availability, fees and insurance,
// migration 046). The notes are professional facts about the provider, checked
// with the contact log's privacy guard before they are saved; the audit keeps
// which fields changed, never the words.
import type postgres from "postgres";
import type { guard } from "../aeon/guard";
import { audit } from "../audit";
import { db } from "../db";
import { practiceTimeZone } from "../compliance/store";
import { todayIn } from "../compliance/dates";
import { checkNote, logContact } from "./contacts";
import { goingCold, REFER_OUT_LIMITS, REFER_OUT_LABEL, type ReferOutNotes } from "./nurture";
import { pendingLetter } from "./outreach";
import { cardView } from "./plan";

export type { ReferOutNotes } from "./nurture";

/** A whole number of people from 1 to 20, or null. */
export function readCount(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 20 ? v : null;
}

/** Logs that she referred `count` people (1 to 20) to this card. No note, no client fields, ever. */
export async function logReferralOut(
  sourceId: string,
  input: { count: number; happenedOn?: string | null; by: "clinician" | "aeon" },
  sql: postgres.Sql = db(),
) {
  if (readCount(input.count) === null) throw new Error("Say how many people, from 1 to 20.");
  return logContact(sourceId, { kind: "referred_out", count: input.count, happenedOn: input.happenedOn ?? null, note: null, by: input.by }, sql);
}

/**
 * Why a "Draft a follow-up note" can't run for this card, or null when it can: the server
 * checks the card is really going cold, and that no letter is waiting for her approval or
 * approved and not sent (a waiting letter is never overwritten by a nudge).
 */
export async function nudgeRefusal(sourceId: string, sql: postgres.Sql = db()): Promise<string | null> {
  const view = await cardView(sourceId, sql);
  if (!view) return "That referral source is no longer on the board.";
  const tz = await practiceTimeZone(sql);
  if (!goingCold(view.card, view.contacts, view.tier.tier, todayIn(tz), tz)) {
    return `${view.card.name} isn't going cold, so there's no follow-up note to draft. Use Draft email when it's time.`;
  }
  const waiting = await pendingLetter(sourceId);
  if (waiting) {
    return waiting.status === "ready"
      ? `A letter to ${view.card.name} is approved and ready to send. Copy and send that one first.`
      : `A letter to ${view.card.name} is already waiting in Approvals. Approve or change that one instead.`;
  }
  return null;
}

type Row = { id: string; refer_out_availability: string | null; refer_out_fees: string | null; refer_out_insurance: string | null };

/** Her refer-out notes for these cards, by id. Empty on a database without migration 046 (the Vercel copy before it runs). */
export async function referOutNotesFor(ids: string[], sql: postgres.Sql = db()): Promise<Record<string, ReferOutNotes>> {
  if (ids.length === 0) return {};
  const rows = await sql<Row[]>`
    select id, refer_out_availability, refer_out_fees, refer_out_insurance from practice_os.referral_sources
     where id in ${sql(ids)} and (refer_out_availability is not null or refer_out_fees is not null or refer_out_insurance is not null)`.catch(() => [] as Row[]);
  return Object.fromEntries(
    rows.map((r) => [r.id, { availability: r.refer_out_availability, fees: r.refer_out_fees, insurance: r.refer_out_insurance }]),
  );
}

/**
 * Saves her notes about someone she refers to. A field left out keeps its
 * saved value; an empty one clears it. Each note goes through the privacy
 * guard (no client names or details). Throws in plain words.
 */
export async function saveReferOutNotes(
  sourceId: string,
  input: Partial<Record<keyof ReferOutNotes, string | null>>,
  sql: postgres.Sql = db(),
  check?: (t: string) => ReturnType<typeof guard>,
  by: "clinician" | "aeon" = "clinician",
): Promise<ReferOutNotes> {
  const [card] = await sql<Row[]>`
    select id, refer_out_availability, refer_out_fees, refer_out_insurance from practice_os.referral_sources where id = ${sourceId}`;
  if (!card) throw new Error("That referral source is no longer on the board.");
  const next: ReferOutNotes = { availability: card.refer_out_availability, fees: card.refer_out_fees, insurance: card.refer_out_insurance };
  const changed: (keyof ReferOutNotes)[] = [];
  for (const key of Object.keys(REFER_OUT_LIMITS) as (keyof ReferOutNotes)[]) {
    if (!(key in input) || input[key] === undefined) continue;
    const value = typeof input[key] === "string" ? input[key]!.trim() || null : null;
    if (value) {
      if (value.length > REFER_OUT_LIMITS[key]) throw new Error(`Keep "${REFER_OUT_LABEL[key]}" under ${REFER_OUT_LIMITS[key]} characters.`);
      const refused = await checkNote(value, check);
      if (refused) throw new Error(refused);
    }
    if (value !== next[key]) changed.push(key);
    next[key] = value;
  }
  if (changed.length) {
    await sql`
      update practice_os.referral_sources
         set refer_out_availability = ${next.availability}, refer_out_fees = ${next.fees}, refer_out_insurance = ${next.insurance},
             refer_out_updated_at = now(), updated_at = now()
       where id = ${sourceId}`;
    await audit({ actor: by, action: "referral_refer_out_notes_saved", subjectType: "referral_source", subjectId: sourceId, details: { fields: changed } }, sql);
  }
  return next;
}
