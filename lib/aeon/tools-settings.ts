// Chat tools that change her real settings (AGENTS.md > chat-first). Before these,
// "my fees are $150 intake, $130 sessions" only reached memory, so Aeon said
// "Done" while Good Faith Estimates still priced the old fees. Each tool writes
// the one store the app itself reads, and every write is audited with its from
// and to values, so undo_last_setting can put a wrong change back:
//   fees + open days  -> clinician_profile.fee_schedule / office_hours (lib/gfe/store.ts)
//   license type      -> clinician_profile.credential + credentialing identity/license,
//                        then the compliance calendar is rebuilt, all in one transaction
//   client-form policies -> client_form_templates '_practice' (lib/client-forms/store.ts)
// Like update_facts, her own stated setting in the chat is her own edit: the tool
// runs, except in Manual mode, where runTool() puts it in the ask bar first. Over
// MCP (another agent, not her) runTool() always queues it for her approval
// (queuesOverMcp). All are changesData, so the view-only demo copy refuses them.
import type postgres from "postgres";
import { z } from "zod";
import { audit } from "../audit";
import { formList, prepare } from "../client-forms";
import * as forms from "../client-forms/store";
import { syncCalendar } from "../compliance/store";
import { CREDENTIALS, type Credential } from "../compliance/types";
import { loadCredentialingProfile, updateCredentialingSection } from "../credentialing/store";
import { db } from "../db";
import { money } from "../gfe/build";
import { feeScheduleSchema, loadPracticeSettings, officeHoursSchema, savePracticeSettings, type Fee, type OfficeHours } from "../gfe/store";
import { CPT } from "../superbill/codes";
import type { AeonTool, ToolContext, ToolResult } from "./tools";

const json = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failed = (why: string, extra: Record<string, unknown> = {}): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify({ ok: false, saved: false, error: why, ...extra }) }],
  isError: true,
});
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

/** A refusal the tool returns as ok: false, saving nothing. */
class NotSaved extends Error {
  constructor(
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Typed per tool, stored loosely, as in tools.ts (runTool parses the input first). */
function tool<I extends z.ZodRawShape>(
  def: Omit<AeonTool, "run" | "input" | "preflight" | "forApproval"> & {
    input: I;
    run: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult>;
    preflight?: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult | null>;
    forApproval?: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<{ args: unknown; shows: string } | null>;
  },
): AeonTool {
  return { queuesOverMcp: true, ...def } as unknown as AeonTool;
}

/** Turns a thrown store error (zod, NotSaved or plain) into a refusal Aeon has to report as not saved. */
async function saving(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof NotSaved) return failed(err.message, err.extra);
    if (err instanceof z.ZodError) return failed(err.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; "));
    return failed(err instanceof Error ? err.message.slice(0, 400) : "Couldn't save that.");
  }
}

// ---- Fees ----------------------------------------------------------------------------------

export const INTAKE_CODE = "90791";
/** The psychotherapy codes a "session" or "follow-up" fee can mean. */
export const SESSION_CODES = ["90832", "90834", "90837"] as const;
const CODES = CPT as Record<string, { label: string }>;

const feeChange = z
  .object({
    code: z.string().regex(/^[A-Z0-9]{5}$/, "A 5-character CPT code").optional().describe("A CPT code, e.g. 90834. Use it when she names a session length or a code."),
    service: z.enum(["intake", "follow_up"]).optional().describe("intake = first session (90791); follow_up = her regular therapy session."),
    all_lengths: z.boolean().optional().describe("follow_up only: true when she says the same fee is for every session length."),
    dollars: z.number().min(0).max(10_000).describe("The fee in dollars, e.g. 150. At least $1."),
    free: z.boolean().optional().describe("true only when she says this service is free; then dollars is 0."),
  })
  .strict()
  .refine((c) => Boolean(c.code) !== Boolean(c.service), { message: "Give either a code or a service (intake or follow_up), not both." })
  .refine((c) => c.dollars >= 1 || (c.dollars === 0 && c.free === true), { message: "A fee must be at least $1. A free service needs free: true, and only when she says it's free." });
export type FeeChange = z.infer<typeof feeChange>;

type Changed = { code: string; label: string; from: string | null; to: string };

/** Applies her fee changes to the saved list. Plain code; throws NotSaved when a change is unclear. */
export function applyFees(current: Fee[], changes: FeeChange[]): { fees: Fee[]; changed: Changed[] } {
  const fees = current.map((f) => ({ ...f }));
  const changed: Changed[] = [];
  const set = (code: string, cents: number) => {
    const known = CODES[code]?.label;
    if (!known) throw new NotSaved(`${code} isn't a CPT code Practice-OS knows. Codes it knows: ${Object.keys(CODES).join(", ")}.`);
    const at = fees.findIndex((f) => f.code === code);
    if (at >= 0) {
      changed.push({ code, label: fees[at].label, from: money(fees[at].cents), to: money(cents) });
      fees[at] = { ...fees[at], cents };
    } else {
      fees.push({ code, label: known, cents });
      changed.push({ code, label: known, from: null, to: money(cents) });
    }
  };
  for (const c of changes) {
    const cents = Math.round(c.dollars * 100);
    if (c.code) set(c.code, cents);
    else if (c.service === "intake") set(INTAKE_CODE, cents);
    else {
      const sessions = fees.filter((f) => (SESSION_CODES as readonly string[]).includes(f.code));
      if (sessions.length === 1) set(sessions[0].code, cents);
      else if (c.all_lengths && sessions.length > 1) for (const s of sessions) set(s.code, cents);
      else {
        const options = (sessions.length ? sessions.map((s) => ({ code: s.code, label: s.label, now: money(s.cents) })) : SESSION_CODES.map((code) => ({ code, label: CODES[code].label, now: null })));
        throw new NotSaved("Which session length is this fee for? Nothing was changed.", { ask_which: options, or: "all_lengths: true if it's the same for every length" });
      }
    }
  }
  return { fees, changed };
}

const feeList = (fees: Fee[]) => fees.map((f) => ({ code: f.code, label: f.label, fee: money(f.cents) }));

// Session lengths in her own words (CPT time ranges: 90832 16-37 min, 90834 38-52, 90837 53+).
const LENGTH_WORDS: [string, RegExp][] = [
  ["90832", /\b90832\b|\b(?:30|thirty)[- ]?(?:min|mins|minutes?)\b|\bhalf[- ]an?[- ]hour\b|\bhalf[- ]hour\b|\b30s\b/i],
  ["90834", /\b90834\b|\b(?:45|forty[- ]five)[- ]?(?:min|mins|minutes?)\b|\b45s\b/i],
  ["90837", /\b90837\b|\b(?:53|55|60|sixty|fifty[- ]three)[- ]?(?:min|mins|minutes?)\b|\b(?:an?|one|full)[- ]hour\b|\bhour[- ]long\b|\b60s\b/i],
];
const EVERY_LENGTH = /\b(?:all|every|each|any)\s+(?:of\s+(?:my|the)\s+)?(?:session\s+)?(?:lengths?|sessions?|session types?)\b|\bsame (?:fee |price )?for (?:all|every|each|any)\b|\bregardless of (?:the )?length\b|\bno matter (?:how long|the length)\b/i;

/** The session codes her words name, and whether she said the fee is the same for every length. */
export function lengthsNamed(words: string): { codes: Set<string>; every: boolean } {
  return { codes: new Set(LENGTH_WORDS.filter(([, re]) => re.test(words)).map(([code]) => code)), every: EVERY_LENGTH.test(words) };
}

/** Her words in clauses, each with the session codes it names and the dollar amounts in it: "45-min $130 and 60-min $160" -> two. */
export function feeClauses(words: string): { codes: Set<string>; dollars: number[] }[] {
  return words
    .split(/\s*(?:[,;\n]|\band\b|\bbut\b)\s*/i)
    .filter(Boolean)
    .map((clause) => {
      const codes = new Set(LENGTH_WORDS.filter(([, re]) => re.test(clause)).map(([code]) => code));
      // The amounts once the length words and codes are taken out ("45-minute" isn't $45).
      let rest = clause;
      for (const [, re] of LENGTH_WORDS) rest = rest.replace(new RegExp(re.source, "gi"), " ");
      rest = rest.replace(/\b9\d{4}\b/g, " ");
      const dollars = [...rest.matchAll(/\$\s?(\d{1,5}(?:\.\d{1,2})?)|\b(\d{2,5}(?:\.\d{1,2})?)\b/g)].map((m) => Number(m[1] ?? m[2]));
      return { codes, dollars };
    });
}

export type FeeResolution = { changes: FeeChange[] } | { ask: Record<string, unknown> };

/**
 * Plain code, never the model: which code each session fee is for, from her own words.
 * - A session fee goes to a length only when her words name it, or when she has one session
 *   code saved and names no other length ("sessions are $130" then means that one).
 * - Each amount belongs to its own clause ("45-min $130 and 60-min $160"): a code and amount
 *   pairing that doesn't match her clauses asks.
 * - Without her words (MCP, or a call she approved) a session fee needs an explicit code.
 * The result has every change with its code, so her approval shows exactly what changes.
 */
export function resolveFees(current: Fee[], changes: FeeChange[], herWords: string | undefined): FeeResolution {
  const sessions = current.filter((f) => (SESSION_CODES as readonly string[]).includes(f.code));
  const options = sessions.length
    ? sessions.map((s) => ({ code: s.code, label: s.label, now: money(s.cents) }))
    : SESSION_CODES.map((code) => ({ code, label: CODES[code].label, now: null }));
  const ask = (why: string): FeeResolution => ({ ask: { ask_which: options, why } });
  const isSession = (c: FeeChange) => c.service === "follow_up" || (c.code !== undefined && (SESSION_CODES as readonly string[]).includes(c.code));
  if (herWords === undefined) {
    if (changes.some((c) => c.service === "follow_up")) return ask("Without her own words, a session fee needs its CPT code (90832, 90834 or 90837).");
    return { changes };
  }
  const { codes, every } = lengthsNamed(herWords);
  const clauses = feeClauses(herWords);
  // code -> the amounts her clauses tie to it (only clauses that name one code).
  const paired = new Map<string, Set<number>>();
  for (const cl of clauses) if (cl.codes.size === 1 && cl.dollars.length) paired.set([...cl.codes][0], new Set([...(paired.get([...cl.codes][0]) ?? []), ...cl.dollars]));
  const out: FeeChange[] = [];
  for (const c of changes) {
    if (!isSession(c)) {
      out.push(c);
      continue;
    }
    if (c.all_lengths) {
      if (!every) return ask("She didn't say the fee is the same for every session length.");
      out.push(c);
      continue;
    }
    let code = c.code;
    if (!code) {
      // "Sessions" with one saved session code means that code, unless her words name another length.
      if (codes.size === 1 && sessions.length === 1 && sessions[0].code !== [...codes][0]) return ask(`Her words name ${[...codes][0]}, not ${sessions[0].code}.`);
      if (codes.size === 1) code = [...codes][0];
      else if (codes.size === 0 && sessions.length === 1) code = sessions[0].code;
      else if (codes.size === 0 && sessions.length > 1) return ask("She has more than one session length saved and didn't name one.");
      else if (codes.size === 0) return ask("She hasn't saved a session length yet and didn't name one.");
      else {
        const fits = [...paired].filter(([, amounts]) => amounts.has(c.dollars)).map(([k]) => k);
        if (fits.length !== 1) return ask("Her words name more than one session length; each fee needs its own length.");
        code = fits[0];
      }
    }
    if (codes.size === 0) {
      // No length in her words: only her one saved session code.
      if (!(sessions.length === 1 && sessions[0].code === code)) return ask(`Her words don't name ${code} or its session length.`);
    } else if (!codes.has(code)) {
      return ask(`Her words name ${[...codes].join(" and ")}, not ${code}.`);
    }
    const amounts = paired.get(code);
    if (amounts && !amounts.has(c.dollars)) return ask(`She tied ${[...amounts].map((d) => `$${d}`).join(" or ")} to ${code}, not $${c.dollars}.`);
    if (codes.size > 1 && !amounts) return ask(`Her words don't say which fee is for ${code}.`);
    out.push({ code, dollars: c.dollars, ...(c.free ? { free: true } : {}) });
  }
  return { changes: out };
}

/** The old resolveFees question alone, for callers that only want to know whether to ask. */
export function sessionLengthQuestion(current: Fee[], changes: FeeChange[], herWords: string): Record<string, unknown> | null {
  const r = resolveFees(current, changes, herWords);
  return "ask" in r ? r.ask : null;
}

/** "90834 Therapy, 38-52 minutes: $150 -> $130", one line per code her approval changes. */
export function feeLines(changed: Changed[]): string {
  return changed.map((c) => `${c.code} ${c.label}: ${c.from ?? "not set"} -> ${c.to}`).join("\n");
}

const ASK_LENGTH =
  "Which session length is this fee for? Nothing was changed. List these to her and ask; never pick one yourself. " +
  "Call again with the code she names, or all_lengths: true only if she says it's the same for every length.";

// ---- Open days -----------------------------------------------------------------------------

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const dayName = (n: number) => DAY_NAMES[n][0].toUpperCase() + DAY_NAMES[n].slice(1);
const daysView = (h: OfficeHours) => ({ open_days: h.weekdays.map(dayName), closed_on: h.closed_on, closes_federal_holidays: h.close_federal_holidays });

export type DaysChange = {
  only_weekdays?: (typeof DAY_NAMES)[number][];
  add_weekdays?: (typeof DAY_NAMES)[number][];
  remove_weekdays?: (typeof DAY_NAMES)[number][];
  add_closed_on?: string[];
  remove_closed_on?: string[];
  close_federal_holidays?: boolean;
};

/** Plain code: "Saturdays too" adds a day; only an explicit full list replaces them. */
export function applyDays(current: OfficeHours, c: DaysChange): OfficeHours {
  let days = c.only_weekdays ? c.only_weekdays.map((d) => DAY_NAMES.indexOf(d)) : [...current.weekdays];
  for (const d of c.add_weekdays ?? []) days.push(DAY_NAMES.indexOf(d));
  const drop = new Set((c.remove_weekdays ?? []).map((d) => DAY_NAMES.indexOf(d)));
  days = [...new Set(days)].filter((d) => !drop.has(d)).sort();
  if (!days.length) throw new NotSaved("That would leave no open days. Nothing was changed.");
  const closedDrop = new Set(c.remove_closed_on ?? []);
  return {
    weekdays: days,
    closed_on: [...new Set([...current.closed_on, ...(c.add_closed_on ?? [])])].filter((d) => !closedDrop.has(d)).sort(),
    close_federal_holidays: c.close_federal_holidays ?? current.close_federal_holidays,
  };
}

// ---- License type --------------------------------------------------------------------------

/** License titles as the boards write them (Illinois IDFPR: "Licensed Clinical Psychologist"). */
export const LICENSE_NAMES: Record<Credential, string> = {
  LCPC: "Licensed Clinical Professional Counselor",
  LCSW: "Licensed Clinical Social Worker",
  LMFT: "Licensed Marriage and Family Therapist",
  Psychologist: "Licensed Clinical Psychologist",
};
const IL_BOARD = "Illinois Department of Financial and Professional Regulation";

/**
 * Her license type everywhere the app reads it: profile and license line, credentialing
 * identity and license, the audit row and the rebuilt calendar, all in one transaction.
 */
export async function setLicenseType(credential: Credential, by: string) {
  return db().begin(async (tx) => {
    const sql = tx as unknown as postgres.Sql;
    const [before] = await tx<{ id: string; credential: string; full_name: string; practice_name: string; is_sample: boolean; state: string; license_line: string }[]>`
      select id, credential, full_name, practice_name, is_sample, state, license_line from practice_os.clinician_profile limit 1 for update`;
    if (!before) throw new NotSaved("There is no practice profile yet; finish onboarding first. Nothing was changed.");
    const cred = await loadCredentialingProfile(sql);
    const state = cred?.license.state || before.state;
    const board = cred?.license.board || (state === "IL" ? IL_BOARD : "");
    if (!board) throw new NotSaved(`Practice-OS doesn't know her ${state} licensing board yet, so it can't update her credentialing license. Add the board on Admin › Credentialing first. Nothing was changed.`);
    const practiceName = cred?.identity.practiceName || before.practice_name;
    if (!practiceName) throw new NotSaved("Her practice name is missing on her profile. Nothing was changed.");
    const line = `${before.full_name}, ${credential}${before.is_sample ? " (fictional demo practice)" : ""}`;
    await tx`update practice_os.clinician_profile set credential = ${credential}, license_line = ${line} where id = ${before.id}`;
    await updateCredentialingSection(
      "identity",
      { name: cred?.identity.name || before.full_name, credential, practice_name: practiceName, email: cred?.identity.email ?? "", phone: cred?.identity.phone ?? "" },
      by,
      sql,
    );
    const licenseType = `${LICENSE_NAMES[credential]} (${credential})`;
    await updateCredentialingSection("license", { type: licenseType, state, board }, by, sql);
    await audit(
      {
        actor: by === "clinician" ? "clinician" : "aeon",
        action: "license_type_changed",
        subjectType: "clinician_profile",
        details: { by, from: before.credential, to: credential, from_license_line: before.license_line, from_license_type: cred?.license.type ?? null },
      },
      sql,
    );
    const calendar = await syncCalendar(sql);
    return {
      before: { license_type: before.credential, license_line: before.license_line },
      after: { license_type: credential, license_line: line, credentialing_license: licenseType },
      calendar_items: calendar.written,
      calendar_removed: calendar.removed,
      needs_facts: calendar.needs_facts.map((n) => n.title),
    };
  });
}

// ---- Practice policies (client forms) ------------------------------------------------------

/** A fee in dollars, or "none" when she says there is no fee. $0 never slips in by accident. */
const policyDollars = (what: string) =>
  z.union([z.number().min(1).max(1000), z.literal("none")]).optional().describe(`${what}, in dollars (at least $1), or "none" when she says there is no such fee.`);

const policyInput = {
  cancel_hours: z.number().int().min(0).max(168).optional().describe("How much notice she asks for to cancel, in hours (24h -> 24)."),
  late_cancel_fee_dollars: policyDollars("Late cancellation fee"),
  no_show_fee_dollars: policyDollars("No-show fee"),
  returned_payment_fee_dollars: policyDollars("Returned payment fee"),
  reply_within_hours: z.number().int().min(1).max(168).optional().describe("How fast she replies to messages, when she says hours ('within 24 hours')."),
  reply_within_business_days: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("When she says business days ('within 2 business days' -> 2). Never turn business days into hours."),
  records_fee_note: z.string().trim().max(240).optional().describe("What she charges for copies of records, in her words."),
  privacy_officer: z.string().trim().max(120).optional().describe("Who handles privacy questions (usually herself)."),
  backup_colleague: z.string().trim().max(160).optional().describe("The colleague who contacts clients if she can't, with a title, e.g. 'Jordan Lee, LCSW'."),
  accepts_insurance: z.boolean().optional(),
  offers_sliding_scale: z.boolean().optional(),
  texting_ok: z.boolean().optional().describe("Whether clients may text her about scheduling."),
  npp_effective_on: isoDay.optional().describe("The date her Notice of Privacy Practices takes effect."),
};

/** Her chat words to the stored shape: dollars become cents, "none" becomes 0. A reply time in one unit clears the other. */
export function toPolicies(input: z.infer<z.ZodObject<typeof policyInput>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (k.endsWith("_dollars")) out[k.replace(/_dollars$/, "_cents")] = v === "none" ? 0 : Math.round((v as number) * 100);
    else out[k] = v;
  }
  if (input.reply_within_business_days !== undefined) out.reply_within_hours = null;
  else if (input.reply_within_hours !== undefined) out.reply_within_business_days = null;
  return out;
}

const NUMBER_WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1 };
/** The sentence of her message about her reply time ("I reply within 2 business days"), or "" when none is. */
export function replySentence(words: string): string {
  return words.split(/(?<=[!?;]|(?<!\b(?:Dr|Mr|Ms|Mrs|Mx|St|Ave|Jr|Sr|Inc|vs))\.)\s+|\n+/).find((x) => /\b(?:repl(?:y|ies|ying)|respond\w*|get back|answer\w*|messages?|emails?)\b/i.test(x)) ?? "";
}

/** "within 2 business days" in her words, as a number of days. */
export function businessDaysSaid(words: string): number | null {
  const m = /\b(\d{1,2}|one|two|three|four|five|a)\s+business\s+days?\b/i.exec(words);
  if (!m) return null;
  return NUMBER_WORD[m[1].toLowerCase()] ?? Number(m[1]);
}

/** Which client forms can download now, and why the rest can't (the same check as the PDF route). */
async function formsStatus() {
  const loaded = await forms.loadFacts();
  if (!loaded) return { ready: 0, not_ready: [{ form: "all", why: "The practice details on Admin › Credentialing aren't filled in yet." }] };
  const overrides = await forms.loadAllOverrides();
  const rows = formList().map((def) => ({ form: def.title, blockers: prepare(def, loaded.facts, overrides[def.id] ?? {}).blockers }));
  return { ready: rows.filter((r) => !r.blockers.length).length, not_ready: rows.filter((r) => r.blockers.length).map((r) => ({ form: r.form, why: r.blockers[0] })) };
}

// ---- Undo ----------------------------------------------------------------------------------

const UNDOABLE = ["office_settings_saved", "client_form_policies_saved", "client_form_policies_restored", "license_type_changed"] as const;

/** Puts back the value before the most recent settings change, from its audit row (an undo counts as a change too). */
export async function undoLastSetting(by: string) {
  const [row] = await db()<{ id: string; action: (typeof UNDOABLE)[number]; at: Date; actor: string; details: Record<string, unknown> }[]>`
    select id, action, at, actor, details from practice_os.audit_log
    where action in ${db()(UNDOABLE as unknown as string[])} and details ? 'from'
    order by id desc limit 1`;
  if (!row) throw new NotSaved("There's no settings change on record to undo.");
  const from = row.details.from as Record<string, unknown>;
  const when = row.at.toISOString().slice(0, 16).replace("T", " ");
  if (row.action === "office_settings_saved") {
    const hours = officeHoursSchema.parse(from.hours);
    const fees = feeScheduleSchema.parse(from.fees);
    const { before } = await savePracticeSettings({ hours, fees }, by);
    return { undid: "fees and office days", changed_on: when, by: row.actor, before: { fees: feeList(before.fees), ...daysView(before.hours) }, after: { fees: feeList(fees), ...daysView(hours) } };
  }
  if (row.action === "license_type_changed") {
    const credential = z.enum(CREDENTIALS).parse(from);
    const r = await setLicenseType(credential, by);
    return { undid: "license type", changed_on: when, by: row.actor, before: r.before, after: r.after, needs_facts: r.needs_facts };
  }
  const value = z.object({ saved: z.boolean(), policies: z.record(z.unknown()) }).parse(from);
  const before = await forms.loadPolicies();
  await forms.restorePolicies(value as never, by);
  return { undid: "client-form practice policies", changed_on: when, by: row.actor, before, after: value };
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
    queuesOverMcp: false,
    run: async () => {
      const [{ hours, fees }, policies, [p]] = await Promise.all([
        loadPracticeSettings(),
        forms.loadPolicies(),
        db()<{ credential: string }[]>`select credential from practice_os.clinician_profile limit 1`,
      ]);
      return json({ license_type: p?.credential ?? null, fees: feeList(fees), ...daysView(hours), policies_saved: policies.saved, policies: policies.policies });
    },
  }),

  tool({
    name: "set_fees",
    title: "Change her fees",
    description:
      "Saves her fees to her fee list, the one Good Faith Estimates and superbills price from. Use it whenever she states a fee ('my intake is $150, sessions $130'), " +
      "never remember. Each change is a CPT code (90834) or a service: intake (90791) or follow_up (her regular session). " +
      "Plain code reads her own words for the session length (and ties each amount to its length): when they don't name one and more than one is saved, or name a different one, " +
      "it returns ask_which: ask her which length, never pick one. all_lengths: true only if she says the fee is the same for every length. Over MCP a session fee needs its code. A fee is at least $1; $0 only with free: true when she says the service is free. " +
      "The result lists every code it changed, from and to; tell her those. saved: false means nothing changed. If it was wrong, undo_last_setting puts it back.",
    input: { changes: z.array(feeChange).min(1).max(10) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Updated your fees",
    changesData: true,
    // Her own message decides the session length, before anything waits for her approval.
    preflight: async ({ changes }, ctx) => {
      try {
        const current = (await loadPracticeSettings()).fees;
        const r = resolveFees(current, changes, ctx.said?.at(-1));
        if ("ask" in r) return failed(ASK_LENGTH, r.ask);
        applyFees(current, r.changes); // an unknown code is refused now, not after her approval
        return null;
      } catch (err) {
        if (err instanceof NotSaved) return failed(err.message, err.extra);
        return failed(`Couldn't read her saved fees, so nothing was changed. ${err instanceof Error ? err.message.slice(0, 200) : ""}`.trim());
      }
    },
    // Her approval shows and runs the resolved codes, with each label and its old and new fee.
    forApproval: async ({ changes }, ctx) => {
      const current = await loadPracticeSettings();
      const r = resolveFees(current.fees, changes, ctx.said?.at(-1));
      if ("ask" in r) return null;
      return { args: { changes: r.changes }, shows: feeLines(applyFees(current.fees, r.changes).changed) };
    },
    run: async ({ changes }, ctx) =>
      saving(async () => {
        const current = await loadPracticeSettings();
        // A call she approved already carries the resolved codes; anything else is resolved from her words again.
        const r = resolveFees(current.fees, changes, ctx.approved ? undefined : ctx.said?.at(-1));
        if ("ask" in r) throw new NotSaved(ASK_LENGTH, r.ask);
        const { fees, changed } = applyFees(current.fees, r.changes);
        const { before, after } = await savePracticeSettings({ hours: current.hours, fees }, ctx.by);
        return json({ saved: true, changed, before: feeList(before.fees), after: feeList(after.fees), used_by: ["Good Faith Estimates", "superbills", "client forms"] });
      }),
  }),

  tool({
    name: "set_office_days",
    title: "Change the days her office is open",
    description:
      "Saves which weekdays her practice is open, days it is closed (vacation) and whether it closes on federal holidays. Good Faith Estimate due dates count these days. " +
      "Use it whenever she states her days, never remember. 'Saturdays too' -> add_weekdays ['saturday']; 'not Fridays anymore' -> remove_weekdays ['friday']; " +
      "only_weekdays replaces the whole list and is only for when she names every day she's open ('just Monday to Wednesday now'). " +
      "Times of day aren't stored; only days. saved: false means nothing changed.",
    input: {
      add_weekdays: z.array(z.enum(DAY_NAMES)).min(1).max(7).optional().describe("Days to add to her open days."),
      remove_weekdays: z.array(z.enum(DAY_NAMES)).min(1).max(7).optional().describe("Days she's no longer open."),
      only_weekdays: z.array(z.enum(DAY_NAMES)).min(1).max(7).optional().describe("Every day she is open, only when she lists them all."),
      add_closed_on: z.array(isoDay).max(60).optional().describe("Dates the office is closed."),
      remove_closed_on: z.array(isoDay).max(60).optional().describe("Closed dates to take back off."),
      close_federal_holidays: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Updated your office days",
    changesData: true,
    run: async (input, ctx) =>
      saving(async () => {
        if (Object.values(input).every((v) => v === undefined)) throw new NotSaved("Nothing to change.");
        const current = await loadPracticeSettings();
        const hours = applyDays(current.hours, input);
        const { before, after } = await savePracticeSettings({ hours, fees: current.fees }, ctx.by);
        return json({ saved: true, before: daysView(before.hours), after: daysView(after.hours) });
      }),
  }),

  tool({
    name: "set_license_type",
    title: "Change her license type",
    description:
      "Saves her license type (LCPC, LCSW, LMFT or Psychologist) on her profile, her credentialing profile and the signature line on forms, then rebuilds her " +
      "deadlines calendar, because license renewal and CE rules depend on it. Use it when she corrects it ('I'm an LCSW, not an LCPC'), never remember. " +
      "Takes the type only, never a license number. saved: false means nothing changed. needs_facts lists dates the new calendar still needs from her.",
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
      "late-cancel and no-show fees in dollars, reply time (hours, or business days as she said them), records fee, privacy contact, backup colleague, " +
      "whether she bills insurance, sliding scale, texting, and the date her privacy notice takes effect. " +
      "Use it whenever she states one ('24h cancellation, $100 late fee' -> cancel_hours 24, late_cancel_fee_dollars 100), never remember. " +
      "No client details. The result lists which forms can download now and what still blocks the others; tell her what's still missing.",
    input: policyInput,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Saved your practice policies",
    changesData: true,
    // "2 business days" stays business days: plain code checks her words before anything saves or waits.
    preflight: async (input, ctx) => {
      const days = businessDaysSaid(replySentence(ctx.said?.at(-1) ?? ""));
      if (days === null) return null;
      const given = input.reply_within_hours !== undefined || input.reply_within_business_days !== undefined;
      if (given && (input.reply_within_hours !== undefined || input.reply_within_business_days !== days)) {
        return failed(`She said ${days} business day${days === 1 ? "" : "s"}. Call again with reply_within_business_days: ${days} and no reply_within_hours. Nothing was saved.`);
      }
      return null;
    },
    run: async (input, ctx) =>
      saving(async () => {
        const next = toPolicies(input);
        if (!Object.keys(next).length) throw new NotSaved("Nothing to change.");
        const before = await forms.loadPolicies();
        const policies = await forms.savePolicies(next, db(), ctx.by);
        return json({
          saved: true,
          changed: Object.keys(next),
          before: before.policies,
          after: policies,
          ...(input.reply_within_business_days ? { reply_time: `Saved as ${input.reply_within_business_days} business day${input.reply_within_business_days === 1 ? "" : "s"}, as she said.` } : {}),
          forms: await formsStatus(),
        });
      }),
  }),

  tool({
    name: "undo_last_setting",
    title: "Undo the last settings change",
    description:
      "Puts back the value from before the most recent settings change (fees and office days, license type, or client-form policies), from the audit log. " +
      "Use it when she says a change Aeon just made was wrong ('no, undo that'). It says what it undid, when, and the value before and after. " +
      "An undo is itself a change: a second undo puts the change back.",
    input: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    label: "Undid the last settings change",
    changesData: true,
    run: async (_input, ctx) => saving(async () => json({ saved: true, ...(await undoLastSetting(ctx.by)) })),
  }),
];
