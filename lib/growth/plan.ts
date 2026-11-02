// The private-pay planner (docs/research.md > Growth agent, "build the private-pay
// planner first"): from her fees, her insurance panels and a few numbers she gives,
// how many private-pay clients replace each panel's income, which panel to drop
// first, and a 12-week plan to fill the practice in about 3 months.
//
// Plain code only: no model does any of this math. A payer rate she hasn't given is
// never guessed; the plan asks for it instead. Every assumption is a named constant
// shown to her with the plan, so she can see and change it.
import { z } from "zod";
import type { Fee } from "../gfe/store";

/** Average weeks in a month (52 / 12). */
export const WEEKS_PER_MONTH = 52 / 12;
/** Starting guess: half of free consults become clients. She can change it. */
export const DEFAULT_CONSULT_TO_CLIENT = 0.5;
/** Starting guess for unpaid admin time per insurance session (claims, denials, re-credentialing), by payer kind. */
export const ADMIN_MINUTES: Record<string, number> = { medicare: 15, medicaid: 20, mco: 20, commercial: 10, military: 15, platform: 5, other: 10 };
/** A therapy hour: the 53-minute session plus notes. */
export const SESSION_MINUTES = 60;
export const PLAN_WEEKS = 12;

export const panelInputSchema = z
  .object({
    payer: z.string().trim().min(1).max(80),
    /** Insurance sessions she sees each week on this panel. null = she hasn't said. */
    weekly_sessions: z.number().min(0).max(60).nullable(),
    /** What the payer pays per session, in cents. null = she hasn't said. */
    rate_cents: z.number().int().min(0).max(100_000).nullable(),
    /** Unpaid admin minutes per session; missing = the starting guess for the payer kind. */
    admin_minutes: z.number().min(0).max(120).nullable().optional(),
    kind: z.string().max(20).optional(),
  })
  .strict();
export type PanelInput = z.infer<typeof panelInputSchema>;

export const planInputSchema = z
  .object({
    panels: z.array(panelInputSchema).max(12),
    /** Her private-pay fee per session in cents; missing = her main fee from the fee list. */
    private_fee_cents: z.number().int().min(0).max(100_000).nullable().optional(),
    /** Private-pay sessions she already sees each week. */
    current_private_weekly: z.number().min(0).max(60).optional(),
    target_weekly_sessions: z.number().min(1).max(60).nullable(),
    target_monthly_income_cents: z.number().int().min(0).max(10_000_000).nullable(),
    consult_to_client: z.number().min(0.05).max(1).optional(),
  })
  .strict();
export type PlanInput = z.infer<typeof planInputSchema>;

export type PanelResult = {
  payer: string;
  weeklySessions: number;
  rateCents: number | null;
  monthlyCents: number | null;
  /** Private-pay clients (seen weekly) whose fees equal this panel's income. null until the rate is known. */
  clientsToReplace: number | null;
  adminMinutes: number;
  /** What an hour of her time earns on this panel, admin included. */
  hourlyCents: number | null;
};

export type PlanWeek = { week: number; consults: number; newClients: number; totalPrivateClients: number; focus: string };
export type Checkpoint = { week: number; title: string; check: string };

export type PrivatePayPlan = {
  privateFeeCents: number | null;
  panels: PanelResult[];
  /** The panel to drop first: lowest pay for her time. null if no rates are known. */
  dropFirst: { payer: string; clientsToReplace: number; why: string } | null;
  insuranceMonthlyCents: number | null;
  /** New private-pay clients to reach her monthly income goal, panels kept. */
  clientsForIncome: number | null;
  /** The number to fill in 12 weeks. */
  goalClients: number | null;
  openSlots: number | null;
  weeks: PlanWeek[];
  checkpoints: Checkpoint[];
  /** Questions to ask her before the plan is complete. Never answered by guessing. */
  asks: string[];
  headline: string;
  assumptions: string[];
  notes: string[];
};

/** Whole dollars when it is whole: $150, $1,288, $92.50. */
export const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const ceil = (n: number) => Math.ceil(n - 1e-9);

/** Her plain private-pay session fee: the first fee that isn't an intake (same rule as Media). */
export function mainFeeCents(fees: Pick<Fee, "label" | "cents" | "code">[]): number | null {
  const fee = fees.find((x) => x.code === "90834") ?? fees.find((x) => !/\b(intake|first session|initial|evaluation|assessment)\b/i.test(x.label)) ?? fees[0];
  return fee ? fee.cents : null;
}

/** Cumulative share of the goal reached by the end of each week: setup in weeks 1-2, then a steady climb. */
export function rampShare(week: number): number {
  if (week <= 2) return 0;
  return Math.min(1, (week - 2) / (PLAN_WEEKS - 2));
}

export function privatePayPlan(input: PlanInput, fees: Pick<Fee, "label" | "cents" | "code">[] = []): PrivatePayPlan {
  const asks: string[] = [];
  const notes: string[] = [];
  const conversion = input.consult_to_client ?? DEFAULT_CONSULT_TO_CLIENT;
  const fee = input.private_fee_cents ?? mainFeeCents(fees);
  if (fee === null || fee === 0) asks.push("What do you charge a private-pay client for one therapy session?");

  const panels: PanelResult[] = input.panels.map((p0) => {
    if (p0.weekly_sessions === null) asks.push(`How many ${p0.payer} sessions do you see in a typical week?`);
    const p = { ...p0, weekly_sessions: p0.weekly_sessions ?? 0 };
    const admin = p.admin_minutes ?? ADMIN_MINUTES[p.kind ?? "other"] ?? ADMIN_MINUTES.other;
    if (p.rate_cents === null && (p0.weekly_sessions === null || p.weekly_sessions > 0)) asks.push(`What does ${p.payer} pay you for one session? (Your contract or an EOB shows it.)`);
    const monthly = p.rate_cents === null ? null : Math.round(p.weekly_sessions * p.rate_cents * WEEKS_PER_MONTH);
    const clients = p.rate_cents === null || !fee ? null : ceil((p.weekly_sessions * p.rate_cents) / fee);
    const hourly = p.rate_cents === null ? null : Math.round((p.rate_cents * 60) / (SESSION_MINUTES + admin));
    return { payer: p.payer, weeklySessions: p.weekly_sessions, rateCents: p.rate_cents, monthlyCents: monthly, clientsToReplace: clients, adminMinutes: admin, hourlyCents: hourly };
  });

  const active = panels.filter((p) => p.weeklySessions > 0);
  const known = active.filter((p) => p.hourlyCents !== null && p.clientsToReplace !== null);
  const drop = [...known].sort((a, b) => a.hourlyCents! - b.hourlyCents! || b.adminMinutes - a.adminMinutes || a.payer.localeCompare(b.payer))[0];
  const dropFirst = drop
    ? {
        payer: drop.payer,
        clientsToReplace: drop.clientsToReplace!,
        why: `${drop.payer} pays the least for your time: about ${usd(drop.hourlyCents!)} an hour once its ${drop.adminMinutes} minutes of admin per session are counted.`,
      }
    : null;
  if (active.length > known.length && dropFirst) notes.push("Which panel to drop first may change once every payer's rate is known.");

  const allKnown = active.every((p) => p.monthlyCents !== null) && input.panels.every((p) => p.weekly_sessions !== null);
  const insuranceMonthly = allKnown ? active.reduce((n, p) => n + (p.monthlyCents ?? 0), 0) : null;
  const currentPrivate = input.current_private_weekly ?? 0;
  const privateMonthly = fee ? currentPrivate * fee * WEEKS_PER_MONTH : 0;

  if (input.target_monthly_income_cents === null) asks.push("How much do you want the practice to bring in each month, before taxes?");
  if (input.target_weekly_sessions === null) asks.push("How many sessions a week do you want to see when you're full?");

  const clientsForIncome =
    input.target_monthly_income_cents !== null && insuranceMonthly !== null && fee
      ? Math.max(0, ceil((input.target_monthly_income_cents - insuranceMonthly - privateMonthly) / (fee * WEEKS_PER_MONTH)))
      : null;
  const insuranceWeekly = active.reduce((n, p) => n + p.weeklySessions, 0);
  const openSlots = input.target_weekly_sessions === null ? null : Math.max(0, Math.floor(input.target_weekly_sessions - insuranceWeekly - currentPrivate));

  const candidates = [clientsForIncome, dropFirst?.clientsToReplace ?? null].filter((n): n is number => n !== null);
  const goal = candidates.length ? Math.max(...candidates) : null;
  if (goal !== null && openSlots !== null && goal > openSlots) {
    notes.push(
      dropFirst
        ? `You have ${openSlots} open slots a week. Fill those first; past that, each new private-pay client takes a slot you free up as ${dropFirst.payer} clients finish.`
        : `You have ${openSlots} open slots a week, fewer than the goal. Past that, new clients need slots freed from a panel.`,
    );
  }

  const weeks: PlanWeek[] = [];
  if (goal !== null) {
    let before = 0;
    for (let w = 1; w <= PLAN_WEEKS; w++) {
      const total = Math.round(goal * rampShare(w));
      const add = total - before;
      weeks.push({
        week: w,
        newClients: add,
        consults: add ? ceil(add / conversion) : 0,
        totalPrivateClients: currentPrivate + total,
        focus: w === 1 ? "Approve your website and ad drafts, then publish the site." : w === 2 ? "Start the ads under your monthly cap. Answer consult requests the same day." : w < 7 ? "Keep the ads running; follow up on every consult request." : "Hold steady; shift ad money toward the searches that booked consults.",
      });
      before = total;
    }
  }

  const checkpoints: Checkpoint[] =
    goal === null
      ? []
      : [
          { week: 2, title: "Live", check: "Your site is published and the ads are running under your cap." },
          { week: 4, title: "First clients", check: `${Math.round(goal * rampShare(4))} new private-pay clients. If consults are low, look at which searches your ads showed for.` },
          { week: 8, title: "Halfway and more", check: `${Math.round(goal * rampShare(8))} new private-pay clients. Still behind? Raise the cap only if you choose to.` },
          {
            week: 12,
            title: dropFirst ? `Ready to replace ${dropFirst.payer}` : "Full",
            check: dropFirst
              ? `${goal} new private-pay clients. Check your ${dropFirst.payer} contract for how much notice it needs before you leave the panel.`
              : `${goal} new private-pay clients.`,
          },
        ];

  const headline =
    dropFirst && fee
      ? `You need ${dropFirst.clientsToReplace} private-pay client${dropFirst.clientsToReplace === 1 ? "" : "s"} to replace ${dropFirst.payer}. 12-week plan.`
      : asks.length
        ? "Aeon needs a few numbers to finish your plan."
        : goal !== null
          ? `You need ${goal} more private-pay clients. 12-week plan.`
          : "Your 12-week plan.";

  return {
    privateFeeCents: fee,
    panels,
    dropFirst,
    insuranceMonthlyCents: insuranceMonthly,
    clientsForIncome,
    goalClients: goal,
    openSlots,
    weeks,
    checkpoints,
    asks: [...new Set(asks)],
    headline,
    assumptions: [
      "Each private-pay client comes once a week.",
      `A month is ${WEEKS_PER_MONTH.toFixed(2)} weeks.`,
      `About ${Math.round(conversion * 100)}% of free consults become clients (Aeon's starting guess; tell Aeon yours).`,
      "Admin time per insurance session is Aeon's starting guess by payer type; tell Aeon yours.",
    ],
    notes,
  };
}

/** [Sample] numbers for the fictional demo practice, used until she gives her own. */
export const SAMPLE_INPUT: PlanInput = {
  panels: [
    { payer: "BCBSIL", weekly_sessions: 14, rate_cents: 9200, kind: "commercial" },
    { payer: "Aetna", weekly_sessions: 6, rate_cents: 10500, kind: "commercial" },
  ],
  current_private_weekly: 2,
  target_weekly_sessions: 25,
  target_monthly_income_cents: 1_200_000,
};
