import { addDays, addMonths, daysBetween, type ISODate } from "../compliance/dates";
import { buildCalendar } from "../compliance/schedule";
import type { Facts, Rule } from "../compliance/types";
import type { CredentialingProfile } from "./profile";

// CAQH prep: what to fix before she re-attests. Dates come from the same rules
// as the Deadlines page (CAQH: 180 days in Illinois, 120 elsewhere; the license
// renewal rule for her state), so the two pages never disagree. Aeon prepares;
// attesting is hers.

export const ATTEST_YOURSELF = "You must log in and click Attest yourself.";
export const CAQH_URL = "https://proview.caqh.org/pr";
/** Documents expiring within this many days are flagged even after the attest date. */
export const EXPIRY_WARNING_DAYS = 60;

export type ChecklistItem = { id: string; label: string; detail?: string; done: boolean; you: boolean };

export type CaqhPrep = {
  attestBy: ISODate | null;
  attestRuleTitle: string | null;
  cycleDays: number | null;
  licenseExpiresOn: ISODate | null;
  items: ChecklistItem[];
  /** Always ATTEST_YOURSELF. The checklist ends here. */
  finalStep: typeof ATTEST_YOURSELF;
};

/** "Dec 1, 2026" */
export function niceDate(iso: ISODate): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
}

function cycleDaysOf(rule: Rule): number | null {
  return rule.schedule.type === "after_fact" ? rule.schedule.days : null;
}

/** Gaps of more than 6 months between jobs that have no written explanation. */
export function unexplainedGaps(p: CredentialingProfile, today: ISODate): { from: ISODate; to: ISODate }[] {
  const jobs = [...p.workHistory].sort((a, b) => a.from.localeCompare(b.from));
  const gaps: { from: ISODate; to: ISODate }[] = [];
  for (let i = 1; i < jobs.length; i++) {
    const prevEnd = jobs[i - 1].to ?? today;
    const start = jobs[i].from;
    if (addMonths(prevEnd, 6) < start) gaps.push({ from: prevEnd, to: start });
  }
  return gaps.filter((g) => !p.gapExplanations.some((e) => e.from <= g.from && e.to >= g.to));
}

export function caqhPrep(p: CredentialingProfile, facts: Facts, rules: Rule[], today: ISODate): CaqhPrep {
  const cal = buildCalendar(rules, facts, today);
  const caqh = cal.due.find((d) => d.rule.category === "caqh_reattestation");
  const license = cal.due
    .filter((d) => d.rule.category === "license_renewal")
    .sort((a, b) => a.due_on.localeCompare(b.due_on))[0];
  const attestBy = caqh?.due_on ?? null;
  const flagBy = attestBy && attestBy > addDays(today, EXPIRY_WARNING_DAYS) ? attestBy : addDays(today, EXPIRY_WARNING_DAYS);
  const items: ChecklistItem[] = [];

  if (!facts.caqh_last_attested_on) {
    items.push({
      id: "caqh_date",
      label: "When did you last attest on CAQH?",
      detail: "Add the date on the Deadlines page so Aeon can count to the next one.",
      done: false,
      you: true,
    });
  }

  const licenseSoon = license ? license.due_on <= flagBy : false;
  items.push({
    id: "license",
    label: licenseSoon ? "Renew your license, then upload the new license verification" : "License is current in CAQH",
    detail: license ? `${p.license.type}, ${p.license.state}: expires ${niceDate(license.due_on)}. License number: not stored here.` : "Aeon doesn't have your license expiration yet.",
    done: Boolean(license) && !licenseSoon,
    you: licenseSoon,
  });

  items.push({
    id: "npi",
    label: "NPI and taxonomy match NPPES",
    detail: `Type ${p.npi.type} NPI ${p.npi.number}, taxonomy ${p.npi.taxonomy} (${p.npi.taxonomyLabel}).`,
    done: /^\d{10}$/.test(p.npi.number),
    you: false,
  });

  for (const doc of p.documents) {
    const expiring = doc.expiresOn !== null && doc.expiresOn <= flagBy;
    const expired = doc.expiresOn !== null && doc.expiresOn < today;
    if (!doc.onFile) {
      items.push({ id: `doc_${doc.id}`, label: `Upload ${doc.upload}`, detail: `${doc.label} is missing.`, done: false, you: true });
    } else if (expiring) {
      const when = expired ? `expired ${niceDate(doc.expiresOn!)}` : `expires ${niceDate(doc.expiresOn!)}, in ${daysBetween(today, doc.expiresOn!)} days`;
      items.push({ id: `doc_${doc.id}`, label: `Upload ${doc.upload}`, detail: `${doc.label} ${when}.`, done: false, you: true });
    }
  }

  items.push({
    id: "location",
    label: "Practice address, phone and hours match",
    detail: `${p.practiceLocation.address.street}, ${p.practiceLocation.address.city}, ${p.practiceLocation.address.state} ${p.practiceLocation.address.zip}.`,
    done: true,
    you: false,
  });

  const gaps = unexplainedGaps(p, today);
  items.push({
    id: "work_history",
    label: gaps.length ? "Explain each gap in your work history over 6 months" : "Work history has no unexplained gaps",
    detail: gaps.length ? gaps.map((g) => `${niceDate(g.from)} to ${niceDate(g.to)}`).join("; ") : undefined,
    done: gaps.length === 0,
    you: gaps.length > 0,
  });

  items.push({
    id: "disclosures",
    label: facts.practice_state === "IL" ? "Answer the Illinois disclosure questions" : "Answer the disclosure questions",
    detail: "Only you can answer these.",
    done: false,
    you: true,
  });
  items.push({ id: "view_errors", label: "Click Review and Attest, then fix anything under View errors", done: false, you: true });

  return {
    attestBy,
    attestRuleTitle: caqh?.title ?? null,
    cycleDays: caqh ? cycleDaysOf(caqh.rule) : null,
    licenseExpiresOn: license?.due_on ?? null,
    items,
    finalStep: ATTEST_YOURSELF,
  };
}
