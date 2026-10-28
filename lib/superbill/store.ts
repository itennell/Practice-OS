import type postgres from "postgres";
import { z } from "zod";
import { audit } from "../audit";
import { toDate, type ISODate } from "../compliance/dates";
import { practiceToday } from "../compliance/store";
import { db } from "../db";
import { money } from "../gfe/build";
import { loadPracticeSettings, type Fee } from "../gfe/store";
import { CPT, CPT_CODES, DX_POINTERS, MODIFIER_CODES, MULTI_UNIT, POS_CODES, type CptCode, type DxPointer, type Modifier, type PosCode } from "./codes";

// Saved superbills (migration 011). A row holds only the practice side: dates,
// codes, units, fees, place of service, diagnosis pointer letters and what was
// paid. Every input is a date, a number or a value from a fixed list, and the
// schemas are strict, so a client's name or diagnosis has nowhere to go. The
// client side is left as blank boxes in the PDF that she fills in herself.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").refine((d) => {
  try {
    toDate(d);
    return true;
  } catch {
    return false;
  }
}, "Not a real date");

export const lineInputSchema = z
  .object({
    date_of_service: isoDate,
    cpt: z.enum(CPT_CODES),
    modifier: z.enum(MODIFIER_CODES).nullable().optional(),
    units: z.number().int().min(1).max(8).optional(),
    /** Charge per unit in cents; defaults to her fee for that code. */
    cents: z.number().int().min(0).max(10_000_00).optional(),
    pos: z.enum(POS_CODES),
    dx_pointers: z.array(z.enum(DX_POINTERS)).min(1).max(4).optional(),
  })
  .strict();

export const superbillInputSchema = z
  .object({
    lines: z.array(lineInputSchema).min(1).max(31),
    paid_cents: z.number().int().min(0).max(1_000_000_00).optional(),
  })
  .strict();
export type SuperbillInput = z.infer<typeof superbillInputSchema>;

export type SuperbillLine = {
  date_of_service: ISODate;
  cpt: CptCode;
  modifier: Modifier | null;
  units: number;
  cents: number;
  pos: PosCode;
  dx_pointers: DxPointer[];
};

export type SuperbillRow = {
  id: string;
  reference: string;
  lines: SuperbillLine[];
  total_cents: number;
  paid_cents: number;
  issued_on: ISODate | null;
  created_by: string;
  is_sample: boolean;
  created_at: Date;
};

export const lineTotal = (l: Pick<SuperbillLine, "units" | "cents">) => l.units * l.cents;

/** Fills fees and defaults and checks the lines. Pure; throws a readable message. */
export function priceSuperbill(input: SuperbillInput, fees: Fee[], today: ISODate) {
  const lines: SuperbillLine[] = input.lines.map((l) => {
    const cents = l.cents ?? fees.find((f) => f.code === l.cpt)?.cents;
    if (cents === undefined) throw new Error(`${l.cpt} isn't on your fee list. Add it in Settings or give the fee.`);
    const units = l.units ?? 1;
    if (units > 1 && !MULTI_UNIT.includes(l.cpt)) throw new Error(`${l.cpt} is one unit per session. Add another line for another date.`);
    if (l.date_of_service > today) throw new Error(`${l.date_of_service} hasn't happened yet. A superbill lists past sessions.`);
    const modifier = l.modifier ?? null;
    if (l.pos === "11" && modifier) {
      throw new Error(`${l.date_of_service}: an office visit (place of service 11) doesn't take a telehealth modifier.`);
    }
    return { date_of_service: l.date_of_service, cpt: l.cpt, modifier, units, cents, pos: l.pos, dx_pointers: [...new Set<DxPointer>(l.dx_pointers ?? ["A"])] };
  });
  lines.sort((a, b) => a.date_of_service.localeCompare(b.date_of_service));
  const total_cents = lines.reduce((s, l) => s + lineTotal(l), 0);
  const paid_cents = input.paid_cents ?? 0;
  if (paid_cents > total_cents) throw new Error(`Paid ${money(paid_cents)} is more than the total ${money(total_cents)}.`);
  return { lines, total_cents, paid_cents };
}

/** A short summary for the list: "Oct 5, 12, 19, 26 · 90837-95 Therapy, 60 minutes". */
export function summarize(lines: SuperbillLine[]): string {
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const codes = [...new Set(lines.map((l) => `${l.cpt}${l.modifier ? `-${l.modifier}` : ""} ${CPT[l.cpt].label}`))];
  return `${lines.map((l) => day(l.date_of_service)).join(", ")} · ${codes.join("; ")}`;
}

/** One plain line per service, for the chat: "2026-10-06 · 90837-95 · Therapy, 60 minutes · $175.00". */
export function describeLine(l: SuperbillLine): string {
  return `${l.date_of_service} · ${l.cpt}${l.modifier ? `-${l.modifier}` : ""} · ${CPT[l.cpt].label} · ${l.units > 1 ? `${l.units} x ` : ""}${money(l.cents)}`;
}

export async function createSuperbill(
  input: unknown,
  opts: { createdBy: string; isSample?: boolean },
  sql: postgres.Sql = db(),
): Promise<SuperbillRow> {
  const parsed = superbillInputSchema.parse(input);
  const [{ fees }, today] = await Promise.all([loadPracticeSettings(sql), practiceToday(sql)]);
  const p = priceSuperbill(parsed, fees, today);
  const [row] = await sql`
    insert into practice_os.superbills (lines, total_cents, paid_cents, created_by, is_sample)
    values (${sql.json(p.lines as never)}, ${p.total_cents}, ${p.paid_cents}, ${opts.createdBy}, ${opts.isSample ?? false})
    returning *`;
  const sb = toRow(row);
  await audit(
    {
      actor: opts.createdBy.startsWith("chat:") || opts.createdBy.startsWith("mcp:") ? "aeon" : "clinician",
      action: "superbill_created",
      subjectType: "superbill",
      subjectId: sb.id,
      details: { by: opts.createdBy, reference: sb.reference, lines: p.lines.length, total_cents: p.total_cents, paid_cents: p.paid_cents },
    },
    sql,
  );
  return sb;
}

const asDate = (v: unknown): ISODate | null => (v instanceof Date ? v.toISOString().slice(0, 10) : ((v as string | null) ?? null));

function toRow(r: Record<string, unknown>): SuperbillRow {
  return { ...(r as unknown as SuperbillRow), issued_on: asDate(r.issued_on) };
}

export async function listSuperbills(limit = 50, sql: postgres.Sql = db()): Promise<SuperbillRow[]> {
  const rows = await sql`select * from practice_os.superbills order by created_at desc limit ${limit}`;
  return rows.map(toRow);
}

export async function getSuperbill(id: string, sql: postgres.Sql = db()): Promise<SuperbillRow | null> {
  const [r] = await sql`select * from practice_os.superbills where id = ${id}`;
  return r ? toRow(r) : null;
}

/** She handed it to the client. Only she does this; Aeon never sends a superbill. */
export async function markGiven(id: string, by: string, sql: postgres.Sql = db()): Promise<SuperbillRow | null> {
  const today = await practiceToday(sql);
  const [r] = await sql`
    update practice_os.superbills set issued_on = ${today} where id = ${id} and issued_on is null returning *`;
  if (!r) return getSuperbill(id, sql);
  const sb = toRow(r);
  await audit(
    { actor: "clinician", action: "superbill_given", subjectType: "superbill", subjectId: id, details: { by, reference: sb.reference } },
    sql,
  );
  return sb;
}
