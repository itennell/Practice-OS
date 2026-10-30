import type postgres from "postgres";
import { z } from "zod";
import { audit } from "../audit";
import { addDays, addMonths, daysBetween, toDate, type ISODate } from "../compliance/dates";
import { practiceToday } from "../compliance/store";
import { db } from "../db";

// Her insurance (payer) applications (migration 009). Aeon prepares forms and
// tracks dates; she applies, signs and submits. Follow-ups and recredential
// dates show on Deadlines and in the morning brief.

/** Days after applying to follow up if she hasn't heard back. */
export const FOLLOW_UP_DAYS = 30;
/** Payers recredential every 36 months (NCQA standard; BCBSIL 3 years). */
export const RECREDENTIAL_MONTHS = 36;

export const STATUSES = ["not_started", "preparing", "applied", "pending", "follow_up", "approved", "denied", "withdrawn"] as const;
export type PayerStatus = (typeof STATUSES)[number];
/** Statuses that mean she's waiting to hear back from the payer. */
export const WAITING: readonly PayerStatus[] = ["applied", "pending", "follow_up"];
export const STATUS_LABEL: Record<PayerStatus, string> = {
  not_started: "Not started",
  preparing: "Preparing",
  applied: "Applied",
  pending: "Pending with payer",
  follow_up: "Follow up",
  approved: "Approved",
  denied: "Denied",
  withdrawn: "Withdrawn",
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
  try {
    toDate(d);
    return true;
  } catch {
    return false;
  }
}, "Not a real date");

export const applicationSchema = z
  .object({
    id: z.string().uuid().optional(),
    payer: z.string().trim().min(2).max(120),
    form: z.enum(["cms855i"]).nullable().optional(),
    catalog_id: z.string().regex(/^[a-z0-9-]{2,60}$/).nullable().optional(),
    network: z.string().trim().min(2).max(120).nullable().optional(),
    stage: z.enum(["credentialing", "contracting"]).optional(),
    status: z.enum(STATUSES).default("preparing"),
    applied_on: isoDate.nullable().optional(),
    follow_up_on: isoDate.nullable().optional(),
    approved_on: isoDate.nullable().optional(),
    effective_on: isoDate.nullable().optional(),
    recredential_on: isoDate.nullable().optional(),
    reference: z.string().trim().max(60).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type PayerApplication = {
  id: string;
  payer: string;
  form: "cms855i" | null;
  catalog_id: string | null;
  network: string | null;
  stage: "credentialing" | "contracting";
  status: PayerStatus;
  applied_on: ISODate | null;
  follow_up_on: ISODate | null;
  approved_on: ISODate | null;
  effective_on: ISODate | null;
  recredential_on: ISODate | null;
  reference: string | null;
  notes: string | null;
  is_sample: boolean;
};

const asDate = (v: unknown): ISODate | null => (v instanceof Date ? v.toISOString().slice(0, 10) : ((v as string | null) ?? null));
const toRow = (r: Record<string, unknown>): PayerApplication => ({
  ...(r as unknown as PayerApplication),
  applied_on: asDate(r.applied_on),
  follow_up_on: asDate(r.follow_up_on),
  approved_on: asDate(r.approved_on),
  effective_on: asDate(r.effective_on),
  recredential_on: asDate(r.recredential_on),
});

/** Fills in the dates she didn't give: applied today, follow up in 30 days, recredential in 36 months. Pure. */
export function withDefaults(a: z.infer<typeof applicationSchema>, today: ISODate) {
  const status = a.status;
  const applied_on = a.applied_on ?? (status === "preparing" || status === "not_started" ? null : today);
  const waiting = WAITING.includes(status);
  const follow_up_on = a.follow_up_on ?? (waiting && applied_on ? addDays(applied_on, FOLLOW_UP_DAYS) : null);
  const approved_on = a.approved_on ?? (status === "approved" ? today : null);
  const recredential_on = a.recredential_on ?? (status === "approved" && approved_on ? addMonths(approved_on, RECREDENTIAL_MONTHS) : null);
  return {
    payer: a.payer,
    form: a.form ?? null,
    catalog_id: a.catalog_id ?? null,
    network: a.network ?? null,
    stage: a.stage ?? "credentialing",
    status,
    applied_on,
    follow_up_on: waiting ? follow_up_on : null,
    approved_on,
    effective_on: a.effective_on ?? null,
    recredential_on,
    reference: a.reference || null,
    notes: a.notes || null,
  };
}

export async function listPayerApplications(sql: postgres.Sql = db()): Promise<PayerApplication[]> {
  const rows = await sql`select * from practice_os.payer_applications order by created_at`;
  return rows.map(toRow);
}

/** Adds a payer, or updates one by id. Audited (payer and status, never notes). */
export async function savePayerApplication(input: unknown, by: string, sql: postgres.Sql = db()): Promise<PayerApplication> {
  const a = applicationSchema.parse(input);
  const v = withDefaults(a, await practiceToday(sql));
  const [row] = a.id
    ? await sql`
        update practice_os.payer_applications set
          payer = ${v.payer}, form = ${v.form}, catalog_id = coalesce(${v.catalog_id}, catalog_id), network = coalesce(${v.network}, network),
          stage = ${v.stage}, status = ${v.status}, applied_on = ${v.applied_on},
          follow_up_on = ${v.follow_up_on}, approved_on = ${v.approved_on}, effective_on = ${v.effective_on},
          recredential_on = ${v.recredential_on}, reference = ${v.reference}, notes = ${v.notes}
        where id = ${a.id} returning *`
    : await sql`
        insert into practice_os.payer_applications
          (payer, form, catalog_id, network, stage, status, applied_on, follow_up_on, approved_on, effective_on, recredential_on, reference, notes)
        values (${v.payer}, ${v.form}, ${v.catalog_id}, ${v.network}, ${v.stage}, ${v.status}, ${v.applied_on}, ${v.follow_up_on}, ${v.approved_on},
                ${v.effective_on}, ${v.recredential_on}, ${v.reference}, ${v.notes})
        returning *`;
  if (!row) throw new Error("That application doesn't exist.");
  await audit(
    { actor: by === "clinician" ? "clinician" : "aeon", action: "payer_application_saved", subjectType: "payer_application", subjectId: row.id, details: { payer: v.payer, status: v.status, by } },
    sql,
  );
  return toRow(row);
}

export type PayerDate = { id: string; payer: string; kind: "follow_up" | "recredential"; due_on: ISODate; days_left: number; what: string };

/** Follow-ups (applied or pending) and recredential dates due within `days`, overdue included. */
export function payerDates(apps: PayerApplication[], today: ISODate, days: number): PayerDate[] {
  const out: PayerDate[] = [];
  for (const a of apps) {
    if (WAITING.includes(a.status) && a.follow_up_on) {
      out.push({
        id: a.id,
        payer: a.payer,
        kind: "follow_up",
        due_on: a.follow_up_on,
        days_left: daysBetween(today, a.follow_up_on),
        what: `Follow up with ${a.payer} on your application${a.reference ? ` (${a.reference})` : ""}. You make the call or check the portal.`,
      });
    }
    if (a.status === "approved" && a.recredential_on) {
      out.push({
        id: a.id,
        payer: a.payer,
        kind: "recredential",
        due_on: a.recredential_on,
        days_left: daysBetween(today, a.recredential_on),
        what: `Recredential with ${a.payer}. Check your CAQH profile is current first.`,
      });
    }
  }
  return out.filter((d) => d.days_left <= days).sort((x, y) => x.due_on.localeCompare(y.due_on));
}
