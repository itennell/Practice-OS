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
import { checkNote, logContact } from "./contacts";
import { REFER_OUT_LIMITS, REFER_OUT_LABEL, type ReferOutNotes } from "./nurture";

export type { ReferOutNotes } from "./nurture";

/** Logs that she referred `count` people (1 to 20) to this card. No note, no client fields, ever. */
export async function logReferralOut(
  sourceId: string,
  input: { count?: number | null; happenedOn?: string | null; by: "clinician" | "aeon" },
  sql: postgres.Sql = db(),
) {
  return logContact(sourceId, { kind: "referred_out", count: input.count ?? 1, happenedOn: input.happenedOn ?? null, note: null, by: input.by }, sql);
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
