import type postgres from "postgres";
import { z } from "zod";
import { queueApproval } from "../approvals";
import { audit } from "../audit";
import { addMonths, toDate, type ISODate } from "../compliance/dates";
import { practiceToday } from "../compliance/store";
import type { CredentialingProfile } from "../credentialing/profile";
import { db } from "../db";
import { money } from "./build";
import { gfeDueDate, WEEKDAYS, type OpenDays } from "./timing";
import type { ClientIdentity } from "./identity";
import type { GoodFaithEstimate } from "./types";

// Saved Good Faith Estimates. A row never holds who the client is: no name,
// birthday, contact details or diagnosis (migration 006). She types those only
// when she makes the PDF (lib/gfe/identity.ts), and they are never stored.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
  try {
    toDate(d);
    return true;
  } catch {
    return false;
  }
}, "Not a real date");

// --- Office hours and fees (clinician_profile) ---------------------------------------------

export const officeHoursSchema = z
  .object({
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    closed_on: z.array(isoDate).max(366),
    close_federal_holidays: z.boolean(),
  })
  .strict();
export type OfficeHours = z.infer<typeof officeHoursSchema>;

export const feeSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9]{5}$/, "A 5-character CPT or HCPCS code"),
    label: z.string().trim().min(1).max(80),
    cents: z.number().int().min(0).max(10_000_00),
  })
  .strict();
export type Fee = z.infer<typeof feeSchema>;
export const feeScheduleSchema = z.array(feeSchema).max(30);

export function toOpenDays(h: OfficeHours): OpenDays {
  return { weekdays: [...new Set(h.weekdays)].sort(), closedOn: h.closed_on, closeFederalHolidays: h.close_federal_holidays };
}

export async function loadPracticeSettings(sql: postgres.Sql = db()): Promise<{ hours: OfficeHours; fees: Fee[] }> {
  const [row] = await sql`select office_hours, fee_schedule from practice_os.clinician_profile limit 1`;
  const hours = officeHoursSchema.safeParse(row?.office_hours);
  const fees = feeScheduleSchema.safeParse(row?.fee_schedule);
  return {
    hours: hours.success ? hours.data : { weekdays: WEEKDAYS.weekdays, closed_on: [], close_federal_holidays: true },
    fees: fees.success ? fees.data : [],
  };
}

export async function savePracticeSettings(
  next: { hours: OfficeHours; fees: Fee[] },
  by: string,
  sql: postgres.Sql = db(),
): Promise<void> {
  const hours = officeHoursSchema.parse({ ...next.hours, weekdays: [...new Set(next.hours.weekdays)].sort() });
  const fees = feeScheduleSchema.parse(next.fees);
  const codes = fees.map((f) => f.code);
  if (new Set(codes).size !== codes.length) throw new Error("Each fee code can appear once.");
  const [row] = await sql`
    update practice_os.clinician_profile
       set office_hours = ${sql.json(hours as never)}, fee_schedule = ${sql.json(fees as never)}
    returning id`;
  if (!row) throw new Error("Finish onboarding first.");
  await audit(
    { actor: "clinician", action: "office_settings_saved", subjectType: "clinician_profile", details: { by, hours, fee_codes: codes } },
    sql,
  );
}

// --- Drafting an estimate -------------------------------------------------------------------

export const SERVICE_KINDS = {
  individual: "Individual therapy",
  couples: "Couples therapy",
  family: "Family therapy",
  group: "Group therapy",
} as const;

export const LOCATIONS = {
  office: "In the office",
  telehealth: "Telehealth",
  either: "In the office or by telehealth",
} as const;

export const FREQUENCIES = { weekly: "Once a week", every_2_weeks: "Every 2 weeks", monthly: "Once a month" } as const;

export const draftSchema = z
  .object({
    basis: z.enum(["scheduled", "requested"]),
    scheduled_on: isoDate.optional(),
    service_on: isoDate.optional(),
    requested_on: isoDate.optional(),
    service_kind: z.enum(["individual", "couples", "family", "group"]),
    lines: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Z0-9]{5}$/),
            quantity: z.number().int().min(1).max(366),
            location: z.enum(["office", "telehealth", "either"]),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    frequency: z.enum(["weekly", "every_2_weeks", "monthly"]).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.basis === "scheduled" && (!d.scheduled_on || !d.service_on)) {
      ctx.addIssue({ code: "custom", message: "A booked visit needs the booking date and the visit date." });
    }
    if (d.basis === "requested" && !d.requested_on) ctx.addIssue({ code: "custom", message: "Add the date the client asked." });
    if (d.scheduled_on && d.service_on && d.service_on < d.scheduled_on) {
      ctx.addIssue({ code: "custom", message: "The visit can't be before the booking." });
    }
  });
export type Draft = z.infer<typeof draftSchema>;

export type EstimateLine = { code: string; label: string; quantity: number; cents: number; location: keyof typeof LOCATIONS };

export type EstimateRow = {
  id: string;
  reference: string;
  basis: "scheduled" | "requested";
  scheduled_on: ISODate | null;
  service_on: ISODate | null;
  requested_on: ISODate | null;
  due_on: ISODate | null;
  rule: string;
  service_kind: keyof typeof SERVICE_KINDS;
  lines: EstimateLine[];
  recurring: { frequency: keyof typeof FREQUENCIES; visits: number; from: ISODate; through: ISODate } | null;
  total_cents: number;
  issued_on: ISODate | null;
  on_time: boolean | null;
  approval_id: string | null;
  approval_status: "pending" | "running" | "done" | "failed" | "rejected" | null;
  is_sample: boolean;
  created_at: Date;
};

/** Works out lines, total, recurring scope and due date. Pure; throws a readable message. */
export function priceDraft(d: Draft, fees: Fee[], open: OpenDays, today: ISODate) {
  const lines: EstimateLine[] = d.lines.map((l) => {
    const fee = fees.find((f) => f.code === l.code);
    if (!fee) throw new Error(`${l.code} isn't on your fee list. Add it in Settings first.`);
    return { code: fee.code, label: fee.label, quantity: l.quantity, cents: fee.cents, location: l.location };
  });
  const total_cents = lines.reduce((s, l) => s + l.quantity * l.cents, 0);
  const due =
    d.basis === "scheduled"
      ? gfeDueDate({ kind: "scheduled", scheduledOn: d.scheduled_on!, serviceOn: d.service_on! }, open)
      : gfeDueDate({ kind: "requested", requestedOn: d.requested_on! }, open);
  const visits = lines.reduce((s, l) => s + l.quantity, 0);
  // One estimate for recurring care, scope at most 12 months from the estimate (149.610(b)(1)(x)).
  const from = d.service_on ?? d.requested_on!;
  const recurring = d.frequency ? { frequency: d.frequency, visits, from, through: addMonths(today, 12) } : null;
  if (recurring && recurring.through < recurring.from) throw new Error("The first visit is more than 12 months away.");
  return { lines, total_cents, due, recurring };
}

/** Saves the estimate and queues one gfe_issue approval. Never marks it issued. */
export async function draftEstimate(
  input: unknown,
  opts: { createdBy: string; isSample?: boolean },
  sql: postgres.Sql = db(),
): Promise<{ id: string; reference: string; approvalId: string; dueOn: ISODate | null }> {
  const d = draftSchema.parse(input);
  const { hours, fees } = await loadPracticeSettings(sql);
  const today = await practiceToday(sql);
  const p = priceDraft(d, fees, toOpenDays(hours), today);
  const [row] = await sql<{ id: string; reference: string }[]>`
    insert into practice_os.good_faith_estimates
      (basis, scheduled_on, service_on, requested_on, due_on, rule, service_kind, lines, recurring, total_cents, is_sample)
    values (${d.basis}, ${d.scheduled_on ?? null}, ${d.service_on ?? null}, ${d.requested_on ?? null}, ${p.due.dueOn},
            ${p.due.rule}, ${d.service_kind}, ${sql.json(p.lines as never)}, ${p.recurring ? sql.json(p.recurring as never) : null},
            ${p.total_cents}, ${opts.isSample ?? false})
    returning id, reference`;
  const services = p.lines.map((l) => `${l.quantity} x ${l.code} ${money(l.cents)}`).join(" · ");
  const when = d.service_on ? `First visit ${d.service_on}.` : `Requested ${d.requested_on}.`;
  const approvalId = await queueApproval({
    kind: "gfe_issue",
    title: `${row.reference}: ${SERVICE_KINDS[d.service_kind].toLowerCase()}, ${money(p.total_cents)}`,
    preview: {
      body:
        `${services}. ${when} ` +
        (p.due.dueOn ? `Give it to the client by ${p.due.dueOn}. ` : "No deadline at booking. ") +
        "Approving confirms these fees and marks it issued today. Aeon doesn't send it; you give the PDF to the client.",
      reference: row.reference,
      total: money(p.total_cents),
      due_on: p.due.dueOn,
    },
    payload: { estimate_id: row.id },
    createdBy: opts.createdBy,
  });
  await sql`update practice_os.good_faith_estimates set approval_id = ${approvalId} where id = ${row.id}`;
  return { id: row.id, reference: row.reference, approvalId, dueOn: p.due.dueOn };
}

const asDate = (v: unknown): ISODate | null => (v instanceof Date ? v.toISOString().slice(0, 10) : ((v as string | null) ?? null));

function toRow(r: Record<string, unknown>): EstimateRow {
  return {
    ...(r as unknown as EstimateRow),
    scheduled_on: asDate(r.scheduled_on),
    service_on: asDate(r.service_on),
    requested_on: asDate(r.requested_on),
    due_on: asDate(r.due_on),
    issued_on: asDate(r.issued_on),
  };
}

export async function listEstimates(limit = 50, sql: postgres.Sql = db()): Promise<EstimateRow[]> {
  const rows = await sql`
    select e.*, a.status as approval_status
      from practice_os.good_faith_estimates e
      left join practice_os.approvals a on a.id = e.approval_id
     order by e.created_at desc
     limit ${limit}`;
  return rows.map(toRow);
}

export async function getEstimate(id: string, sql: postgres.Sql = db()): Promise<EstimateRow | null> {
  const [r] = await sql`
    select e.*, a.status as approval_status
      from practice_os.good_faith_estimates e
      left join practice_os.approvals a on a.id = e.approval_id
     where e.id = ${id}`;
  return r ? toRow(r) : null;
}

/** What she sees for an estimate's state. Status lives on the approval, never a second field. */
export function estimateStatus(e: Pick<EstimateRow, "approval_status" | "issued_on" | "on_time">): string {
  if (e.issued_on) return e.on_time ? "Issued on time" : "Issued late";
  if (e.approval_status === "rejected") return "Declined";
  if (e.approval_status === "failed") return "Approval failed";
  return "Waiting for you";
}

/** The estimate needs her NPI and tax ID (45 CFR 149.610(c)(1)(v)); they come from Credentialing. */
export class MissingProviderDetails extends Error {
  constructor() {
    super("Add your NPI and tax ID on Paperwork > Credentialing first. The estimate must show both.");
  }
}

/**
 * Builds the PDF model: the saved estimate, her credentialing profile (NPI, TIN,
 * office), and the identity she typed, which is used here and dropped.
 */
export function toGoodFaithEstimate(
  e: EstimateRow,
  client: ClientIdentity,
  issuedOn: ISODate,
  p: CredentialingProfile,
): GoodFaithEstimate {
  if (!p.npi.number || !p.tin) throw new MissingProviderDetails();
  const office = `${p.practiceLocation.address.street}, ${p.practiceLocation.address.city}, ${p.practiceLocation.address.state} ${p.practiceLocation.address.zip}`;
  const where = { office, telehealth: `Telehealth from ${p.practiceLocation.address.state}`, either: `${office}, or telehealth` };
  const kind = SERVICE_KINDS[e.service_kind];
  const r = e.recurring;
  return {
    reference: e.reference,
    draft: !e.issued_on,
    issuedOn,
    convener: `${p.identity.practiceName}${e.is_sample ? " (fictional demo practice)" : ""}`,
    patient: {
      firstName: client.firstName,
      middleName: client.middleName || undefined,
      lastName: client.lastName,
      dob: client.dob,
      address: { street: client.street, apartment: client.apartment || undefined, city: client.city, state: client.state, zip: client.zip },
      phone: client.phone,
      email: client.email,
      contactPreference: client.contactPreference,
    },
    primaryService: {
      description: r ? `${kind}: ${FREQUENCIES[r.frequency].toLowerCase()}, ${r.visits} visits.` : `${kind}.`,
      scheduledDates: e.service_on ? [e.service_on] : [],
    },
    recurring: r ? { frequency: FREQUENCIES[r.frequency], totalVisits: r.visits, from: r.from, through: r.through } : null,
    diagnosis: { primary: client.diagnosisCode || null, secondary: null },
    estimates: [
      {
        provider: {
          name: `${p.identity.name}, ${p.identity.credential}${e.is_sample ? " (fictional demo practice)" : ""}`,
          type: p.license.type,
          npi: p.npi.number,
          tin: p.tin,
          address: p.practiceLocation.address,
          contact: { person: p.identity.name, phone: p.identity.phone, email: p.identity.email },
        },
        lines: e.lines.map((l) => ({
          service: l.label,
          location: where[l.location],
          diagnosisCode: client.diagnosisCode || null,
          serviceCode: { type: "CPT" as const, number: l.code },
          quantity: l.quantity,
          unitCharge: l.cents,
        })),
        notes: "Self-pay rate.",
      },
    ],
    separatelyScheduled: [],
    howToRequest: `call ${p.identity.phone} or email ${p.identity.email}.`,
    isSample: e.is_sample,
  };
}
