import { addMonths, toDate } from "../compliance/dates";
import { isValidNpi } from "../credentialing/profile";
import type { GfeProviderEstimate, GoodFaithEstimate } from "./types";

// Totals and the checks a GFE must pass before it can be shown or rendered.

export function lineTotal(l: { quantity: number; unitCharge: number }): number {
  return l.quantity * l.unitCharge;
}

export function providerTotal(e: GfeProviderEstimate): number {
  return e.lines.reduce((s, l) => s + lineTotal(l), 0);
}

export function grandTotal(g: GoodFaithEstimate): number {
  return g.estimates.reduce((s, e) => s + providerTotal(e), 0);
}

export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Every reason this GFE breaks 45 CFR 149.610. Empty means it's complete. */
export function gfeProblems(g: GoodFaithEstimate): string[] {
  const out: string[] = [];
  const p = g.patient;
  if (!p.firstName.trim() || !p.lastName.trim()) out.push("Patient name is missing (c)(1)(i).");
  try {
    toDate(p.dob);
  } catch {
    out.push("Patient date of birth is missing or invalid (c)(1)(i).");
  }
  if (!g.primaryService.description.trim()) out.push("Describe the primary service in plain language (c)(1)(ii).");
  if (g.estimates.length === 0) out.push("List at least one provider's items (c)(1)(iii).");
  for (const e of g.estimates) {
    const who = e.provider.name;
    if (!isValidNpi(e.provider.npi)) out.push(`${who}: NPI is not a valid 10-digit NPI (c)(1)(v).`);
    if (!/^\d{2}-\d{7}$/.test(e.provider.tin)) out.push(`${who}: TIN must look like 12-3456789 (c)(1)(v).`);
    if (!e.provider.address.state) out.push(`${who}: state is missing (c)(1)(v).`);
    if (e.lines.length === 0) out.push(`${who}: no items listed (c)(1)(iii).`);
    for (const l of e.lines) {
      if (!/^[A-Z0-9]{5}$/.test(l.serviceCode.number)) out.push(`${who}: "${l.service}" needs a 5-character service code (c)(1)(iv).`);
      if (!Number.isInteger(l.quantity) || l.quantity < 1) out.push(`${who}: "${l.service}" quantity must be a whole number (c)(1)(iv).`);
      if (!Number.isInteger(l.unitCharge) || l.unitCharge < 0) out.push(`${who}: "${l.service}" needs an expected charge (c)(1)(iv).`);
      if (!l.location.trim()) out.push(`${who}: "${l.service}" needs a location (c)(1)(v).`);
    }
  }
  const r = g.recurring;
  if (r) {
    if (r.through > addMonths(r.from, 12)) out.push("Recurring scope can't be longer than 12 months (b)(1)(x)(B).");
    if (r.through < r.from) out.push("Recurring scope ends before it starts.");
    if (!r.frequency.trim() || r.totalVisits < 1) out.push("State how often and how many visits (b)(1)(x)(A).");
    const visits = g.estimates.flatMap((e) => e.lines).reduce((s, l) => s + l.quantity, 0);
    if (visits !== r.totalVisits) out.push(`Recurring scope says ${r.totalVisits} visits but the items add up to ${visits}.`);
  }
  return out;
}

export function assertComplete(g: GoodFaithEstimate): void {
  const problems = gfeProblems(g);
  if (problems.length) throw new Error(`Good Faith Estimate is incomplete:\n- ${problems.join("\n- ")}`);
}
