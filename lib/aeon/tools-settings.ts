// Chat tools that change her real settings (AGENTS.md > chat-first). Before these,
// "my fees are $150 intake, $130 sessions" only reached memory, so Aeon said
// "Done" while Good Faith Estimates still priced the old fees. Each tool writes
// the one store the app itself reads, and every write is audited:
//   fees + open days  -> clinician_profile.fee_schedule / office_hours (lib/gfe/store.ts)
//   license type      -> clinician_profile.credential + credentialing identity/license,
//                        then the compliance calendar is rebuilt (like update_facts)
//   client-form policies -> client_form_templates '_practice' (lib/client-forms/store.ts)
// Like update_facts, her own stated setting is her own edit: the tool runs, except
// in Manual mode, where runTool() puts it in the ask bar first. All are changesData,
// so the view-only demo copy refuses them.
import { z } from "zod";
import { audit } from "../audit";
import { formList, prepare } from "../client-forms";
import * as forms from "../client-forms/store";
import { CREDENTIALS, type Credential } from "../compliance/types";
import { syncCalendar } from "../compliance/store";
import { loadCredentialingProfile, updateCredentialingSection } from "../credentialing/store";
import { db } from "../db";
import { money } from "../gfe/build";
import { loadPracticeSettings, savePracticeSettings, type Fee } from "../gfe/store";
import { CPT } from "../superbill/codes";
import type { AeonTool, ToolContext, ToolResult } from "./tools";

const json = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failed = (why: string): ToolResult => ({ content: [{ type: "text", text: JSON.stringify({ ok: false, saved: false, error: why }) }], isError: true });
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

/** Typed per tool, stored loosely, as in tools.ts (runTool parses the input first). */
function tool<I extends z.ZodRawShape>(
  def: Omit<AeonTool, "run" | "input"> & { input: I; run: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult> },
): AeonTool {
  return def as unknown as AeonTool;
}

/** Turns a thrown store error (zod or plain) into a refusal Aeon has to report as not saved. */
async function saving(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof z.ZodError) return failed(err.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; "));
    return failed(err instanceof Error ? err.message.slice(0, 400) : "Couldn't save that.");
  }
}

// ---- Fees ----------------------------------------------------------------------------------

export const INTAKE_CODE = "90791";
/** The psychotherapy codes a "session" or "follow-up" fee covers. */
export const SESSION_CODES = ["90832", "90834", "90837"] as const;
const DEFAULT_SESSION_CODE = "90837";

const feeChange = z
  .object({
    code: z.string().regex(/^[A-Z0-9]{5}$/, "A 5-character CPT code").optional().describe("A CPT code, e.g. 90834. Use it when she names a session length or a code."),
    service: z.enum(["intake", "follow_up"]).optional().describe("intake = first session (90791); follow_up = her regular therapy sessions (every therapy code on her list)."),
    dollars: z.number().min(0).max(10_000).describe("The fee in dollars, e.g. 150."),
    label: z.string().trim().min(1).max(80).optional().describe("Only for a code that isn't a common therapy code."),
  })
  .strict()
  .refine((c) => Boolean(c.code) !== Boolean(c.service), { message: "Give either a code or a service (intake or follow_up), not both." });

/** Applies her fee changes to the saved list. Plain code: the codes it touched, in order. */
export function applyFees(current: Fee[], changes: z.infer<typeof feeChange>[]): { fees: Fee[]; changed: { code: string; label: string; from: string | null; to: string }[] } {
  const fees = current.map((f) => ({ ...f }));
  const changed: { code: string; label: string; from: string | null; to: string }[] = [];
  const set = (code: string, cents: number, label?: string) => {
    const known = (CPT as Record<string, { label: string }>)[code]?.label;
    const at = fees.findIndex((f) => f.code === code);
    if (at >= 0) {
      changed.push({ code, label: fees[at].label, from: money(fees[at].cents), to: money(cents) });
      fees[at] = { ...fees[at], cents, ...(label ? { label } : {}) };
    } else {
      const name = label ?? known;
      if (!name) throw new Error(`${code} isn't a code Practice-OS knows; pass a label for it.`);
      fees.push({ code, label: name, cents });
      changed.push({ code, label: name, from: null, to: money(cents) });
    }
  };
  for (const c of changes) {
    const cents = Math.round(c.dollars * 100);
    if (c.code) set(c.code, cents, c.label);
    else if (c.service === "intake") set(INTAKE_CODE, cents, c.label);
    else {
      const sessions = fees.filter((f) => (SESSION_CODES as readonly string[]).includes(f.code)).map((f) => f.code);
      for (const code of sessions.length ? sessions : [DEFAULT_SESSION_CODE]) set(code, cents);
    }
  }
  return { fees, changed };
}

// ---- Open days -----------------------------------------------------------------------------

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const dayName = (n: number) => DAY_NAMES[n][0].toUpperCase() + DAY_NAMES[n].slice(1);

// ---- License type --------------------------------------------------------------------------

export const LICENSE_NAMES: Record<Credential, string> = {
  LCPC: "Licensed Clinical Professional Counselor",
  LCSW: "Licensed Clinical Social Worker",
  LMFT: "Licensed Marriage and Family Therapist",
  Psychologist: "Licensed Clinical Psychologist",
};

/** Her license type everywhere the app reads it: profile, credentialing identity and license, then the calendar. */
export async function setLicenseType(credential: Credential, by: string) {
  const sql = db();
  const [before] = await sql<{ credential: string; full_name: string; is_sample: boolean; state: string }[]>`
    select credential, full_name, is_sample, state from practice_os.clinician_profile limit 1`;
  if (!before) throw new Error("Finish onboarding first; there is no practice profile yet.");
  const line = `${before.full_name}, ${credential}${before.is_sample ? " (fictional demo practice)" : ""}`;
  await sql`update practice_os.clinician_profile set credential = ${credential}, license_line = ${line}`;
  const cred = await loadCredentialingProfile(sql);
  if (cred?.identity.name) {
    await updateCredentialingSection(
      "identity",
      { name: cred.identity.name, credential, practice_name: cred.identity.practiceName || before.full_name, email: cred.identity.email, phone: cred.identity.phone },
      by,
      sql,
    );
  }
  if (cred?.license.state || before.state) {
    const state = cred?.license.state || before.state;
    const board = cred?.license.board || (state === "IL" ? "Illinois Department of Financial and Professional Regulation" : "");
    if (board) await updateCredentialingSection("license", { type: `${LICENSE_NAMES[credential]} (${credential})`, state, board }, by, sql);
  }
  await audit({ actor: "aeon", action: "license_type_changed", subjectType: "clinician_profile", details: { by, from: before.credential, to: credential } }, sql);
  const calendar = await syncCalendar(sql);
  return { from: before.credential, to: credential, license_line: line, calendar_items: calendar.written, calendar_removed: calendar.removed };
}

// ---- Practice policies (client forms) ------------------------------------------------------

const dollarsField = (what: string) => z.number().min(0).max(1000).optional().describe(`${what}, in dollars.`);

const policyInput = {
  cancel_hours: z.number().int().min(0).max(168).optional().describe("How much notice she asks for to cancel, in hours (24h -> 24)."),
  late_cancel_fee_dollars: dollarsField("Late cancellation fee"),
  no_show_fee_dollars: dollarsField("No-show fee"),
  returned_payment_fee_dollars: dollarsField("Returned payment fee"),
  reply_within_hours: z.number().int().min(1).max(168).optional().describe("How fast she replies to messages, in hours."),
  records_fee_note: z.string().trim().max(240).optional().describe("What she charges for copies of records, in her words."),
  privacy_officer: z.string().trim().max(120).optional().describe("Who handles privacy questions (usually herself)."),
  backup_colleague: z.string().trim().max(160).optional().describe("The colleague who contacts clients if she can't, with a title, e.g. 'Jordan Lee, LCSW'."),
  accepts_insurance: z.boolean().optional(),
  offers_sliding_scale: z.boolean().optional(),
  texting_ok: z.boolean().optional().describe("Whether clients may text her about scheduling."),
  npp_effective_on: isoDay.optional().describe("The date her Notice of Privacy Practices takes effect."),
};

/** Her chat words to the stored shape: dollars become cents. */
export function toPolicies(input: z.infer<z.ZodObject<typeof policyInput>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (k.endsWith("_dollars")) out[k.replace(/_dollars$/, "_cents")] = Math.round((v as number) * 100);
    else out[k] = v;
  }
  return out;
}

/** Which client forms can download now, and why the rest can't (the same check as the PDF route). */
async function formsStatus() {
  const loaded = await forms.loadFacts();
  if (!loaded) return { ready: 0, not_ready: [{ form: "all", why: "The practice details on Admin › Credentialing aren't filled in yet." }] };
  const overrides = await forms.loadAllOverrides();
  const rows = formList().map((def) => ({ form: def.title, blockers: prepare(def, loaded.facts, overrides[def.id] ?? {}).blockers }));
  return { ready: rows.filter((r) => !r.blockers.length).length, not_ready: rows.filter((r) => r.blockers.length).map((r) => ({ form: r.form, why: r.blockers[0] })) };
}

export const SETTINGS_TOOLS: AeonTool[] = [
  tool({
    name: "get_practice_settings",
    title: "Read her practice settings",
    description:
      "Her saved settings as the app uses them: fees per CPT code (Good Faith Estimates and superbills price from these), the days the office is open " +
      "(GFE due dates count these), her license type, and the practice policies on her client forms. Read-only. Use it before answering 'what are my fees' and the like.",
    input: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Checked your practice settings",
    changesData: false,
    run: async () => {
      const [{ hours, fees }, policies, [p]] = await Promise.all([
        loadPracticeSettings(),
        forms.loadPolicies(),
        db()<{ credential: string }[]>`select credential from practice_os.clinician_profile limit 1`,
      ]);
      return json({
        license_type: p?.credential ?? null,
        fees: fees.map((f) => ({ code: f.code, label: f.label, fee: money(f.cents) })),
        open_days: hours.weekdays.map(dayName),
        closed_on: hours.closed_on,
        closes_federal_holidays: hours.close_federal_holidays,
        policies_saved: policies.saved,
        policies: policies.policies,
      });
    },
  }),

  tool({
    name: "set_fees",
    title: "Change her fees",
    description:
      "Saves her fees to her fee list, the one Good Faith Estimates and superbills price from. Use it whenever she states a fee ('my intake is $150, sessions $130'), " +
      "never remember. Each change is a code (90834) or a service: intake (90791) or follow_up (every therapy code on her list: 90832, 90834, 90837). " +
      "Example: '150 intake 130 sessions' -> [{service: 'intake', dollars: 150}, {service: 'follow_up', dollars: 130}]. " +
      "The result lists every code it changed, from and to; tell her those. If it says saved: false, it didn't save.",
    input: { changes: z.array(feeChange).min(1).max(10) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Updated your fees",
    changesData: true,
    run: async ({ changes }, ctx) =>
      saving(async () => {
        const current = await loadPracticeSettings();
        const { fees, changed } = applyFees(current.fees, changes);
        await savePracticeSettings({ hours: current.hours, fees }, ctx.by);
        return json({ saved: true, changed, fee_list: fees.map((f) => ({ code: f.code, label: f.label, fee: money(f.cents) })), used_by: ["Good Faith Estimates", "superbills", "client forms"] });
      }),
  }),

  tool({
    name: "set_office_days",
    title: "Change the days her office is open",
    description:
      "Saves which weekdays her practice is open, days it is closed (vacation) and whether it closes on federal holidays. Good Faith Estimate due dates count these days. " +
      "Use it whenever she states her days ('I see clients Monday to Thursday', 'I'm off Dec 24 to 26'), never remember. Times of day aren't stored; only days. " +
      "weekdays replaces the whole list. If it says saved: false, it didn't save.",
    input: {
      weekdays: z.array(z.enum(DAY_NAMES)).min(1).max(7).optional().describe("Every day she is open, e.g. ['monday','tuesday','wednesday','thursday']."),
      add_closed_on: z.array(isoDay).max(60).optional().describe("Dates the office is closed."),
      remove_closed_on: z.array(isoDay).max(60).optional().describe("Closed dates to take back off."),
      close_federal_holidays: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Updated your office days",
    changesData: true,
    run: async (input, ctx) =>
      saving(async () => {
        if (!input.weekdays && !input.add_closed_on && !input.remove_closed_on && input.close_federal_holidays === undefined) return failed("Nothing to change.");
        const current = await loadPracticeSettings();
        const drop = new Set(input.remove_closed_on ?? []);
        const hours = {
          weekdays: input.weekdays ? input.weekdays.map((d) => DAY_NAMES.indexOf(d)) : current.hours.weekdays,
          closed_on: [...new Set([...current.hours.closed_on, ...(input.add_closed_on ?? [])])].filter((d) => !drop.has(d)).sort(),
          close_federal_holidays: input.close_federal_holidays ?? current.hours.close_federal_holidays,
        };
        await savePracticeSettings({ hours, fees: current.fees }, ctx.by);
        const after = await loadPracticeSettings();
        return json({ saved: true, open_days: after.hours.weekdays.map(dayName), closed_on: after.hours.closed_on, closes_federal_holidays: after.hours.close_federal_holidays });
      }),
  }),

  tool({
    name: "set_license_type",
    title: "Change her license type",
    description:
      "Saves her license type (LCPC, LCSW, LMFT or Psychologist) on her profile, her credentialing profile and the signature line on forms, then rebuilds her " +
      "deadlines calendar, because license renewal and CE rules depend on it. Use it when she corrects it ('I'm an LCSW, not an LCPC'), never remember. " +
      "Takes the type only, never a license number. If it says saved: false, it didn't save.",
    input: { license_type: z.enum(CREDENTIALS) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Updated your license type",
    changesData: true,
    run: async ({ license_type }, ctx) => saving(async () => json({ saved: true, ...(await setLicenseType(license_type, ctx.by)) })),
  }),

  tool({
    name: "set_practice_policies",
    title: "Save her practice policies for client forms",
    description:
      "Saves the practice policies every client form uses (practice policies, intake, informed consent and the rest): cancellation notice in hours, " +
      "late-cancel and no-show fees in dollars, reply time, records fee, privacy contact, backup colleague, insurance, sliding scale, texting. " +
      "Use it whenever she states one ('24h cancellation, $100 late fee' -> cancel_hours 24, late_cancel_fee_dollars 100), never remember. " +
      "No client details. The result lists which forms can download now and what still blocks the others; tell her what's still missing.",
    input: policyInput,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Saved your practice policies",
    changesData: true,
    run: async (input, ctx) =>
      saving(async () => {
        const next = toPolicies(input);
        if (!Object.keys(next).length) return failed("Nothing to change.");
        const policies = await forms.savePolicies(next, db(), ctx.by);
        return json({ saved: true, changed: Object.keys(next), policies, forms: await formsStatus() });
      }),
  }),
];

/** Words that make a memory a setting in disguise. remember refuses these and names the tool to use instead. */
const SETTING_PATTERNS: { tool: string; what: string; test: RegExp }[] = [
  { tool: "set_fees", what: "a fee", test: /\$\s?\d|\b\d{2,4}\s?(dollars|bucks)\b|\b(fees?|rates?|charges?|prices?)\b[^.]{0,40}\b\d{2,4}\b/i },
  {
    tool: "set_license_type",
    what: "her license type",
    test: /\b(i'?m an?|i am an?|she is an?|she'?s an?|licensed as an?|license type is|not an?)\s+(LCPC|LCSW|LMFT|LPC|LSW|psychologist)\b/i,
  },
  {
    tool: "set_office_days",
    what: "her office days",
    test: /\b(open|sees? clients|office (hours|days)|in the office)\b[^.]{0,40}\b(mon|tues?|wed|thu|thurs|fri|sat|sun)(day)?s?\b|\b(mon|tues?|wed|thu|thurs|fri|sat|sun)(day)?\s*(-|to|through|thru|–)\s*(mon|tues?|wed|thu|thurs|fri|sat|sun)(day)?\b/i,
  },
  {
    tool: "set_practice_policies",
    what: "a practice policy",
    test: /\bcancel+ation (policy|window|fee|notice)\b|\b\d+\s?(h|hrs?|hours?)\b[^.]{0,20}\bcancel|\bno[- ]show (fee|policy)\b|\blate[- ](cancel(lation)? )?fee\b/i,
  },
];

/** Plain code: which settings tool owns this text, or null when it's fine as a memory. */
export function settingFor(text: string): { tool: string; what: string } | null {
  for (const p of SETTING_PATTERNS) if (p.test.test(text)) return { tool: p.tool, what: p.what };
  return null;
}
