import type { MorningBrief } from "../compliance/brief";
import { daysBetween, type ISODate } from "../compliance/dates";
import type { CredentialingProfile } from "../credentialing/profile";
import type { EstimateRow } from "../gfe/store";
import type { SuperbillRow } from "../superbill/store";

// "What your practice needs next" at the top of Admin. Plain code, no model:
// it reads what the app already knows (the morning brief, credentialing gaps,
// Good Faith Estimates, insurance dates, superbills) and ranks it. Pure.
//
// Ranking, most important first:
//   1. Overdue, anything.
//   2. Due in the next 3 days (a GFE owed to a client counts here: it's federal law).
//   3. Due this week, and gaps that block paperwork she'll need (no NPI or tax ID).
//   4. Urgent deadlines a little further out, and superbills a client is waiting on.
//   5. Setup questions and dates Aeon still needs from her.
// Within a tier, sooner first; undated last; then by title so the order never jumps.

export type NeedKind = "deadline" | "gfe" | "insurance" | "credentialing" | "superbill" | "setup" | "date_needed";

/** One button per item: open the right form already filled (`panel`), go to a page (`href`), or start a chat (`ask`). */
export type NeedAction = { label: string } & ({ panel: AdminPanel } | { href: string } | { ask: string });

export type AdminPanel = "gfe" | "superbill" | "release" | "credentialing" | "insurance" | "hours";

export type NeedItem = {
  id: string;
  kind: NeedKind;
  title: string;
  /** One plain line on why it's here. */
  why: string;
  due_on: ISODate | null;
  days_left: number | null;
  tier: 1 | 2 | 3 | 4 | 5;
  action: NeedAction;
};

export type NeedsInput = {
  today: ISODate;
  brief: MorningBrief | null;
  estimates: EstimateRow[];
  superbills: SuperbillRow[];
  profile: CredentialingProfile | null;
};

export const MAX_NEEDS = 6;

function tierFor(daysLeft: number | null, fallback: NeedItem["tier"]): NeedItem["tier"] {
  if (daysLeft === null) return fallback;
  if (daysLeft < 0) return 1;
  if (daysLeft <= 3) return 2;
  if (daysLeft <= 7) return 3;
  return fallback;
}

function dueWords(daysLeft: number | null): string {
  if (daysLeft === null) return "";
  if (daysLeft < 0) return `${-daysLeft} ${daysLeft === -1 ? "day" : "days"} overdue`;
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "Due tomorrow";
  return `Due in ${daysLeft} days`;
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

export function needsNext({ today, brief, estimates, superbills, profile }: NeedsInput): NeedItem[] {
  const out: NeedItem[] = [];

  if (brief) {
    for (const [list, fallback] of [
      [brief.this_week, 3],
      [brief.urgent_soon, 4],
    ] as const) {
      for (const d of list) {
        const caqh = d.rule_id?.includes("caqh");
        out.push({
          id: `deadline:${d.rule_id ?? d.title}:${d.due_on ?? ""}`,
          kind: "deadline",
          title: d.title,
          why: join(dueWords(d.days_left), d.you_must ? "only you can do this" : null, d.needs_confirming ? "Aeon researched this rule, please confirm" : null),
          due_on: d.due_on,
          days_left: d.days_left,
          tier: tierFor(d.days_left, fallback),
          action: caqh ? { label: "Get me ready", ask: "Get me ready for CAQH" } : { label: "Ask Aeon", ask: `Help me with this: ${d.title}` },
        });
      }
    }
    for (const p of brief.payer_dates) {
      out.push({
        id: `insurance:${p.id}:${p.kind}`,
        kind: "insurance",
        title: p.kind === "follow_up" ? `Follow up with ${p.payer}` : `Recredential with ${p.payer}`,
        why: join(dueWords(p.days_left), p.kind === "follow_up" ? "you make the call or check the portal" : "check CAQH is current first"),
        due_on: p.due_on,
        days_left: p.days_left,
        tier: tierFor(p.days_left, 4),
        action: { label: "Open insurance", panel: "insurance" },
      });
    }
    for (const s of brief.setup_questions) {
      out.push({
        id: `setup:${s.rule_id ?? s.title}`,
        kind: "setup",
        title: s.title,
        why: "A quick question so Aeon knows which deadlines apply to you",
        due_on: null,
        days_left: null,
        tier: 5,
        action: { label: "Answer it", ask: `Ask me about: ${s.title}` },
      });
    }
    for (const n of brief.needs_dates) {
      out.push({
        id: `date:${n.title}`,
        kind: "date_needed",
        title: n.title,
        why: `Aeon needs a date: ${n.question}`,
        due_on: null,
        days_left: null,
        tier: 5,
        action: { label: "Tell Aeon", ask: n.question },
      });
    }
  }

  if (profile) {
    const missing = [!profile.npi.number && "NPI", !profile.tin && "tax ID"].filter(Boolean) as string[];
    if (missing.length) {
      out.push({
        id: "credentialing:ids",
        kind: "credentialing",
        title: `Add your ${missing.join(" and ")}`,
        why: "Superbills and Good Faith Estimates need it",
        due_on: null,
        days_left: null,
        tier: 3,
        action: { label: "Add it", panel: "credentialing" },
      });
    }
  }

  for (const e of estimates) {
    // Waiting for her to confirm the fees; once approved it's issued and off this list.
    if (e.issued_on || e.approval_status !== "pending") continue;
    const left = e.due_on ? daysBetween(today, e.due_on) : null;
    out.push({
      id: `gfe:${e.id}`,
      kind: "gfe",
      title: `Good Faith Estimate ${e.reference}`,
      why: join(left === null ? "No deadline at booking" : `Give it to the client: ${dueWords(left).toLowerCase()}`, "confirm the fees in Approvals"),
      due_on: e.due_on,
      days_left: left,
      tier: tierFor(left, 4),
      action: { label: "Review", href: "/approvals" },
    });
  }

  for (const b of superbills) {
    if (b.issued_on) continue;
    out.push({
      id: `superbill:${b.id}`,
      kind: "superbill",
      title: `Superbill ${b.reference}`,
      why: `${b.lines.length} ${b.lines.length === 1 ? "session" : "sessions"} · ready to give to the client`,
      due_on: null,
      days_left: null,
      tier: 4,
      action: { label: "Open it", panel: "superbill" },
    });
  }

  return out.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.days_left ?? Number.POSITIVE_INFINITY) - (b.days_left ?? Number.POSITIVE_INFINITY) ||
      a.title.localeCompare(b.title),
  );
}
