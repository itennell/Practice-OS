// Grow's tools (Media > Grow), spread into TOOLS in ./tools.ts so the chat and MCP get
// the same ones. The plan is plain-code math; the drafts are plain-code copy from her
// saved facts, checked by lib/growth/policy.ts and queued for her approval. Nothing
// here spends money, calls an ad platform or publishes a site.
import { z } from "zod";
import { GOOGLE_BUDGET_NOTE } from "../growth/ads";
import { usd } from "../growth/plan";
import type { AeonTool, ToolContext, ToolResult } from "./tools";

const text = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });
const cents = (d: number | undefined | null) => (d === undefined || d === null ? d : Math.round(d * 100));

/** A number from chat words: 95, "95", "$95", "$1,200" all read as the number she said. */
const num = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === "string" && /^\s*\$?\s*[\d,]+(?:\.\d+)?\s*$/.test(v) ? Number(v.replace(/[$,\s]/g, "")) : v), z.number().min(min).max(max));

function tool<I extends z.ZodRawShape>(
  def: Omit<AeonTool, "run" | "input"> & { input: I; run: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult> },
): AeonTool {
  return def as unknown as AeonTool;
}

/** Grow's writers save drafts that wait for her approval anyway, so Manual mode doesn't ask twice. */
export const GROWTH_ALWAYS_RUNS = ["draft_google_ads", "draft_meta_ads", "build_website"];

const PAGE = "Media > Grow shows it, with the policy check and the Export buttons.";
const SAMPLE_NOTE = "These are [Sample] numbers for the fictional demo practice. Say so.";

const adInput = {
  monthly_cap_dollars: z.number().min(0).max(50_000).optional().describe("The hard monthly budget cap she chose, in dollars. Never pick one for her."),
  radius_miles: z.number().min(1).max(50).optional().describe("How far from her office to show the ads. Default 5 miles."),
  site_url: z.string().max(300).optional().describe("Her website address (https://), where the ads send people."),
};

async function saveAdSettings(input: { monthly_cap_dollars?: number; radius_miles?: number; site_url?: string }) {
  const store = await import("../growth/store");
  const patch: Record<string, unknown> = {};
  if (input.monthly_cap_dollars !== undefined) patch.monthly_cap_cents = cents(input.monthly_cap_dollars);
  if (input.radius_miles !== undefined) patch.radius_miles = input.radius_miles;
  if (input.site_url) patch.site_url = input.site_url.trim();
  if (Object.keys(patch).length) await store.saveGrowth(patch);
  return store.loadGrowthContext();
}

async function draftAds(kind: "google_ads" | "meta_ads", input: { monthly_cap_dollars?: number; radius_miles?: number; site_url?: string }, ctx: ToolContext): Promise<ToolResult> {
  const store = await import("../growth/store");
  const { MIN_CAP_CENTS, MIN_CAP_MESSAGE } = await import("../growth/policy");
  if (input.monthly_cap_dollars !== undefined && cents(input.monthly_cap_dollars)! < MIN_CAP_CENTS) return fail(`${MIN_CAP_MESSAGE} Ask her for a cap of $150 or more.`);
  let g;
  try {
    g = await saveAdSettings(input);
  } catch (err) {
    return fail(err instanceof z.ZodError ? err.issues.map((i) => i.message).join(" ") : "Couldn't save those settings.");
  }
  if (!g.settings.monthlyCapCents) return text({ needs_her: "Ask her what hard monthly budget cap she wants for ads, in dollars. Never pick one for her; nothing is spent until she turns the ads on herself." });
  try {
    const r = await store.draftAndQueue(kind, ctx.by);
    const d = r.draft as import("../growth/ads").GoogleAdsDraft | import("../growth/ads").MetaAdsDraft;
    return text({
      queued: true,
      approval_id: r.approvalId,
      platform: kind === "google_ads" ? "Google Search" : "Facebook and Instagram",
      monthly_cap: `${g.settings.capIsSample ? "[Sample] " : ""}${usd(d.campaign.monthlyCapCents!)}`,
      ...(d.platform === "google"
        ? { daily_budget: usd(d.campaign.dailyBudgetCents!), budget_note: GOOGLE_BUDGET_NOTE }
        : { lifetime_budget: usd(d.campaign.lifetimeBudgetCents!), runs: `${d.campaign.startDate} to ${d.campaign.endDate}`, budget_note: "A lifetime budget equal to her cap: Meta stops spending when it is used up." }),
      location: d.platform === "google" ? `${d.campaign.location.label}, ${d.campaign.location.radiusMiles} miles` : `${d.adSet.location.label}, ${d.adSet.location.radiusMiles} miles`,
      ...(d.platform === "google"
        ? { keywords: d.adGroup.keywords.map((k) => k.text), headlines: d.ad.headlines, descriptions: d.ad.descriptions }
        : { ads: d.ads.map((a) => ({ text: a.primaryText, headline: a.headline, button: a.ctaLabel })), picture: d.image.source === "muse" ? "made with Muse Image, an empty office, no people" : "a plain stand-in picture" }),
      policy_check: "passed",
      targeting: "Location and keywords only. No remarketing, no customer lists, no health or interest audiences.",
      next: `It's waiting for her approval. Once she approves, she downloads it (paused) and turns it on herself; Practice-OS never spends. ${PAGE}`,
      ...(d.isSample ? { sample: SAMPLE_NOTE } : {}),
    });
  } catch (err) {
    if (err instanceof store.PolicyBlocked) return text({ queued: false, policy_check: "failed", problems: err.findings, next: "Tell her what the check found in plain words. Nothing was queued." });
    throw err;
  }
}

export const GROWTH_TOOLS: AeonTool[] = [
  tool({
    name: "private_pay_plan",
    title: "Plan how many private-pay clients she needs",
    description:
      "Her private-pay plan (plain-code math from her fees, her insurance panels and a few numbers she gives): how many private-pay clients replace each panel's income, which panel to drop first (lowest pay for her time, admin included), and a 12-week plan with weekly consult and booking targets to fill the practice in about 3 months. " +
      "Use when she asks how to go private pay, how many clients she needs, which insurance to drop, or how to fill her practice. " +
      "Pass any numbers she gives; never invent a payer rate, a fee, a target or a session count. If it returns asks, ask her those questions one at a time. Pass save: true once she has given her numbers. " +
      "needs_your_numbers is not a failure: tell her in_plain_words (say [Sample] when it does), then ask ask_her_next. " +
      "When she gives a rate and sessions ('BCBS pays $95, I see 10 a week'), pass them on that payer's panel as rate_dollars: 95, weekly_sessions: 10.",
    input: {
      panels: z
        .array(
          z.object({
            payer: z.string().max(80),
            weekly_sessions: num(0, 60).optional().describe("Sessions a week she sees on this panel."),
            rate_dollars: num(0, 1000).optional().describe("What this payer pays her per session, only if she said it."),
            admin_minutes: num(0, 120).optional().describe("Unpaid admin minutes per session, if she said."),
          }),
        )
        .max(12)
        .optional(),
      private_fee_dollars: num(0, 1000).optional(),
      current_private_weekly: num(0, 60).optional().describe("Private-pay sessions a week she already sees."),
      target_weekly_sessions: num(1, 60).optional(),
      target_monthly_income_dollars: num(0, 100_000).optional(),
      consult_to_client_percent: num(5, 100).optional(),
      save: z.boolean().optional().describe("Save these numbers as hers."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Worked out your private-pay plan",
    changesData: (input: { save?: boolean }) => Boolean(input.save),
    run: async (input) => {
      const store = await import("../growth/store");
      const plan = await import("../growth/plan");
      const ctx = await store.loadGrowthContext();
      const base = await store.planInputFor(ctx.saved, ctx.facts.isSample);
      const given = input.panels ?? [];
      // "BCBS" in chat is her "BCBSIL" panel: the same name, or the same payer family.
      const { familiesOf } = await import("../media/truth");
      const same = (a: string, b: string) => {
        if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
        const fa = familiesOf([a]);
        return fa.size > 0 && [...familiesOf([b])].some((f) => fa.has(f));
      };
      const merged = base.input.panels.map((p) => {
        const g = given.find((x) => same(x.payer, p.payer));
        if (!g) return p;
        // A [Sample] panel she gives numbers for becomes hers: any number she didn't give is asked for, never kept from the sample.
        const keep = <T,>(mine: T | undefined, old: T | null) => (mine !== undefined ? mine : p.sample ? null : old);
        return {
          payer: p.payer,
          kind: p.kind,
          weekly_sessions: keep(g.weekly_sessions, p.weekly_sessions),
          rate_cents: g.rate_dollars !== undefined ? cents(g.rate_dollars)! : p.sample ? null : p.rate_cents,
          admin_minutes: g.admin_minutes ?? (p.sample ? undefined : p.admin_minutes),
        };
      });
      for (const g of given) {
        if (!merged.some((p) => same(p.payer, g.payer)))
          merged.push({ payer: g.payer, weekly_sessions: g.weekly_sessions ?? null, rate_cents: g.rate_dollars !== undefined ? cents(g.rate_dollars)! : null, admin_minutes: g.admin_minutes, kind: "other" });
      }
      const given_fields = {
        current_private_weekly: input.current_private_weekly !== undefined,
        target_weekly_sessions: input.target_weekly_sessions !== undefined,
        target_monthly_income_cents: input.target_monthly_income_dollars !== undefined,
      };
      const sampleFields = (base.input.sample_fields ?? []).filter((f) => !given_fields[f]);
      const parsed = plan.planInputSchema.safeParse({
        ...base.input,
        panels: merged,
        sample_fields: sampleFields,
        ...(input.private_fee_dollars !== undefined ? { private_fee_cents: cents(input.private_fee_dollars) } : {}),
        ...(input.current_private_weekly !== undefined ? { current_private_weekly: input.current_private_weekly } : {}),
        ...(input.target_weekly_sessions !== undefined ? { target_weekly_sessions: input.target_weekly_sessions } : {}),
        ...(input.target_monthly_income_dollars !== undefined ? { target_monthly_income_cents: cents(input.target_monthly_income_dollars) } : {}),
        ...(input.consult_to_client_percent !== undefined ? { consult_to_client: input.consult_to_client_percent / 100 } : {}),
      });
      if (!parsed.success) return fail(`Those numbers don't fit: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Ask her again.`);
      const next = parsed.data;
      if (input.save) await store.saveGrowth({ plan: next });
      const { loadPracticeSettings } = await import("../gfe/store");
      const p = plan.privatePayPlan(next, (await loadPracticeSettings()).fees);
      return text({
        headline: p.headline,
        // What she reads: the plan in plain words, then the first number still missing.
        in_plain_words: plan.planInWords(p),
        ...(p.asks.length ? { needs_your_numbers: true, ask_her_next: p.asks[0] } : {}),
        private_fee: p.privateFeeCents ? usd(p.privateFeeCents) : null,
        panels: p.panels.map((x) => ({
          payer: x.sample ? `[Sample] ${x.payer}` : x.payer,
          sessions_a_week: x.weeklySessions,
          pays_per_session: x.rateCents === null ? "unknown: ask her" : usd(x.rateCents),
          monthly_income: x.monthlyCents === null ? null : usd(x.monthlyCents),
          private_pay_clients_to_replace: x.clientsToReplace,
          pay_per_hour_with_admin: x.hourlyCents === null ? null : usd(x.hourlyCents),
        })),
        drop_first: p.dropFirst,
        clients_for_income_goal: p.clientsForIncome,
        goal_new_private_pay_clients_in_12_weeks: p.goalClients,
        open_slots_a_week: p.openSlots,
        weekly_targets: p.weeks.map((w) => ({ week: w.week, consults: w.consults, new_clients: w.newClients, private_pay_clients: w.totalPrivateClients })),
        checkpoints: p.checkpoints,
        ...(p.asks.length ? { asks: p.asks, rule: "Ask her these. Never guess a rate, a fee or a target." } : {}),
        assumptions: p.assumptions,
        notes: p.notes,
        // Only said when it saved: "saved: false" read as a failed save to the honesty check.
        ...(input.save ? { saved_as_hers: true } : {}),
        ...(p.sample ? { sample: SAMPLE_NOTE } : {}),
        next: `${PAGE} Then offer to draft the website and ads that fill it.`,
      });
    },
  }),

  tool({
    name: "draft_google_ads",
    title: "Draft a Google Search ad campaign",
    description:
      "Drafts a policy-safe Google Search campaign for her practice: service and location keywords for her neighborhood and city radius, negative keywords, a responsive search ad (headlines up to 30 characters, descriptions up to 90) from her saved fees, consult offer and telehealth, a hard monthly budget cap she sets, no remarketing or health audiences, sending people to her website. " +
      "A plain-code policy check must pass, then it waits for her approval; once approved she downloads a Google Ads Editor file (paused) and turns it on herself. Never spends. Ask her for the monthly cap if she hasn't set one.",
    input: adInput,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Drafted your Google ads",
    changesData: true,
    run: (input, ctx) => draftAds("google_ads", input, ctx),
  }),

  tool({
    name: "draft_meta_ads",
    title: "Draft Facebook and Instagram ads",
    description:
      "Drafts one or two Facebook/Instagram ads for her practice: primary text, headline, button, her city radius, adults 18 and up, no health or interest targeting (Meta's personal-attributes rules), with a calm office picture made by Muse Image (no people). " +
      "Same policy check; waits for her approval; then she downloads the Ads Manager spec and the picture and sets it up paused herself. Never spends. Ask her for the monthly cap if she hasn't set one.",
    input: adInput,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Drafted your Facebook and Instagram ads",
    changesData: true,
    run: (input, ctx) => draftAds("meta_ads", input, ctx),
  }),

  tool({
    name: "build_website",
    title: "Build her one-page practice website",
    description:
      "Writes a fast one-page website she owns from her saved facts and Media answers: who she helps (issues, not clients), how it works, fees, superbills and insurance, location and telehealth, a free-consult button to her booking link, about, questions, and her license line. Includes the Google practice details block, llms.txt and a sitemap; no tracking or analytics, no testimonials, no promises. " +
      "It waits for her approval; then she downloads it as a zip, or as plain sections to paste into Squarespace. Nothing is published.",
    input: {
      site_url: z.string().max(300).optional().describe("Her website address (https://), if she has a domain."),
      booking_url: z.string().max(300).optional().describe("Her online booking link (https://), if she gave one."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Built your website draft",
    changesData: true,
    run: async (input, ctx) => {
      const store = await import("../growth/store");
      try {
        const patch: Record<string, string> = {};
        if (input.site_url) patch.site_url = input.site_url.trim();
        if (input.booking_url) patch.booking_url = input.booking_url.trim();
        if (Object.keys(patch).length) await store.saveGrowth(patch);
      } catch (err) {
        return fail(err instanceof z.ZodError ? err.issues.map((i) => i.message).join(" ") : "Couldn't save those addresses.");
      }
      try {
        const r = await store.draftAndQueue("website", ctx.by);
        const d = r.draft as import("../growth/site").SiteDraft;
        return text({
          queued: true,
          approval_id: r.approvalId,
          title: d.title,
          sections: d.sections.map((s) => s.title),
          booking_button: d.bookingLabel,
          has_tracking: false,
          policy_check: "passed",
          next: `It's waiting for her approval. Then she downloads the zip (index.html, llms.txt, robots.txt, sitemap.xml) or the Squarespace text. ${PAGE}`,
          ...(d.isSample ? { sample: SAMPLE_NOTE } : {}),
        });
      } catch (err) {
        if (err instanceof store.PolicyBlocked) return text({ queued: false, policy_check: "failed", problems: err.findings });
        throw err;
      }
    },
  }),
];
