import type postgres from "postgres";
import { z } from "zod";
import { saveDefaultMode, saveFrontDeskRules } from "../approval-settings";
import { isApprovalMode } from "../approval-policy";
import { audit } from "../audit";
import { remember } from "../aeon/memory";
import { answerSetup, ANSWERS, type Answer } from "../compliance/answers";
import { updateFacts, type FactUpdate } from "../compliance/actions";
import { STATES } from "../compliance/states";
import { checkNpiInRegistry, loadCredentialingProfile, updateCredentialingSection } from "../credentialing/store";
import { db } from "../db";
import { loadPracticeSettings, savePracticeSettings } from "../gfe/store";
import { listPayerApplications, savePayerApplication } from "../payers/store";
import {
  CHAPTERS,
  flatten,
  HELPERS,
  normalizeEin,
  normalizeUsPhone,
  QUESTIONS,
  TAXONOMY,
  timezoneFor,
  type Credential,
  type Ctx,
  type HelperId,
  type Screen,
  type Stage,
} from "./chapters";
import { HELPER_QUESTIONS, type PracticeBasics } from "./helper-questions";

// Saving the interview. Every answer goes to the table and writer that already own
// it; onboarding_answers.progress only remembers where she is, what she typed (to
// prefill a screen when she comes back) and what she skipped.

const BY = "clinician"; // she typed every answer herself

export type Progress = {
  values: Record<string, unknown>;
  skipped: string[];
  later: string[];
  current: string | null;
};

type ProfileRow = {
  full_name: string;
  credential: Credential;
  practice_name: string;
  state: string;
  practice_stage: Stage;
  license_line: string;
  is_sample: boolean;
  onboarding_answers: Record<string, unknown>;
  onboarding_completed_at: Date | null;
};

async function loadProfileRow(sql: postgres.Sql): Promise<ProfileRow | null> {
  const [row] = await sql<ProfileRow[]>`
    select full_name, credential, practice_name, state, practice_stage, license_line, is_sample,
           onboarding_answers, onboarding_completed_at
      from practice_os.clinician_profile limit 1`;
  return row ?? null;
}

function progressOf(row: ProfileRow | null): Progress {
  const p = (row?.onboarding_answers?.progress ?? {}) as Partial<Progress>;
  return {
    values: p.values && typeof p.values === "object" ? p.values : {},
    skipped: Array.isArray(p.skipped) ? p.skipped : [],
    later: Array.isArray(p.later) ? p.later : [],
    current: typeof p.current === "string" ? p.current : null,
  };
}

/** What earlier answers say (falls back to her saved profile, e.g. Dana's demo). */
export function ctxFrom(values: Record<string, unknown>, row: Pick<ProfileRow, "state" | "credential" | "practice_stage"> | null): Ctx {
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
  const office = values.office as { zip?: string } | undefined;
  const ce = values.ce as { first_renewal?: boolean } | undefined;
  const medicare = values.medicare as { status?: string } | undefined;
  const medicaid = values.medicaid as { yes?: boolean } | undefined;
  return {
    state: str(values.state) ?? row?.state ?? null,
    credential: (str(values.license) as Credential | null) ?? row?.credential ?? null,
    stage: (str(values.stage) as Stage | null) ?? row?.practice_stage ?? null,
    seesClients: str(values.sees_clients) as Ctx["seesClients"],
    insurance: str(values.insurance) as Ctx["insurance"],
    firstRenewal: bool(ce?.first_renewal),
    medicare: str(medicare?.status) as Ctx["medicare"],
    medicaid: bool(medicaid?.yes),
    officeZip: office?.zip ?? null,
  };
}

function basicsFrom(c: Ctx): PracticeBasics {
  return {
    state: c.state,
    credential: c.credential,
    practiceStage: c.stage,
    officeZip: c.officeZip,
    telehealth: c.seesClients === null ? null : c.seesClients !== "in_person",
  };
}

/** Another session's whole screen (the Muse key step), dropped in after a question. */
export const EXTRA_SCREENS: { after: string; screen: Screen }[] = [];

export function screensFor(values: Record<string, unknown>, row: Pick<ProfileRow, "state" | "credential" | "practice_stage"> | null): Screen[] {
  const c = ctxFrom(values, row);
  return flatten(c, { states: STATES, helpers: HELPER_QUESTIONS, extra: EXTRA_SCREENS, basics: basicsFrom(c) });
}

export type SetupItem = { id: string; title: string; status: string };

export type OnboardingState = {
  screens: Screen[];
  progress: Progress;
  completed: boolean;
  hasProfile: boolean;
  /** Prefills from what's already saved (Dana's demo, or a second visit). */
  saved: Record<string, unknown>;
  setupItems: SetupItem[];
};

export async function loadOnboarding(sql: postgres.Sql = db()): Promise<OnboardingState> {
  const row = await loadProfileRow(sql);
  const progress = progressOf(row);
  const setupItems = row
    ? await sql<SetupItem[]>`
        select id, title, status from practice_os.obligations
         where kind = 'setup' and status in ('upcoming', 'not_yet') order by title`.catch(() => [])
    : [];
  return {
    screens: screensFor(progress.values, row),
    progress,
    completed: Boolean(row?.onboarding_completed_at),
    hasProfile: Boolean(row),
    saved: row ? await savedValues(row, sql) : {},
    setupItems: setupItems.map((s) => ({ id: s.id, title: s.title, status: s.status })),
  };
}

/** What the app already knows, shaped like answers, so screens open filled in. */
async function savedValues(row: ProfileRow, sql: postgres.Sql): Promise<Record<string, unknown>> {
  const cred = await loadCredentialingProfile(sql).catch(() => null);
  const { hours, fees } = await loadPracticeSettings(sql).catch(() => ({ hours: null, fees: [] }) as never);
  const [facts] = await sql`select * from practice_os.compliance_facts limit 1`.catch(() => []);
  const [settings] = await sql`select * from practice_os.settings limit 1`.catch(() => []);
  const out: Record<string, unknown> = {
    name: row.full_name,
    practice_name: row.practice_name,
    state: row.state,
    license: row.credential,
    stage: row.practice_stage,
  };
  const ans = row.onboarding_answers ?? {};
  if (typeof ans.who_i_help === "string") out.who = { chips: [], work: [], text: ans.who_i_help };
  if (cred) {
    if (cred.identity.email || cred.identity.phone) out.contact = { email: cred.identity.email, phone: cred.identity.phone };
    const loc = cred.practiceLocation.address;
    if (loc.street) out.office = { street: loc.street, city: loc.city, state: loc.state, zip: loc.zip };
    if (cred.npi.number) out.npi = cred.npi.number;
    if (cred.tin) out.ein = cred.tin;
    const m = cred.malpractice;
    if (m.carrier) out.malpractice = { carrier: m.carrier, expires_on: m.expiresOn, per_claim: m.perClaim, aggregate: m.aggregate };
  }
  if (hours) out.office_days = { weekdays: hours.weekdays, close_federal_holidays: hours.close_federal_holidays };
  if (fees?.length) out.fees = fees;
  if (facts) {
    const d = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v.slice(0, 10) : null);
    Object.assign(out, {
      license_expires: d(facts.license_expires_on),
      ce: { first_renewal: facts.first_renewal, hours: Number(facts.ce_hours_done) },
      adults_26: facts.sees_adults_26_plus,
      psypact: { yes: facts.has_psypact_apit, date: d(facts.apit_granted_on) },
      qualified_examiner: facts.qualified_examiner,
      pllc: { yes: facts.has_pllc, date: d(facts.pllc_formed_on) },
      entity_tax: facts.entity_tax,
      staff: { employees: facts.employee_count, contractors: facts.has_contractors },
      bcbsil: facts.in_network_bcbsil,
      medicare: {
        status: facts.medicare,
        date: d(facts.medicare === "enrolled" ? facts.medicare_revalidation_due_on : facts.medicare_opt_out_ends_on),
      },
      medicaid: { yes: facts.medicaid_enrolled, date: d(facts.impact_revalidation_due_on) },
      caqh: d(facts.caqh_last_attested_on),
      uses_texting: facts.uses_texting,
    });
  }
  if (settings) {
    if (settings.alert_phone) out.alert_phone = settings.alert_phone;
    if (settings.approval_mode) out.mode = settings.approval_mode;
    if (settings.front_desk_rules) out.text_missed_callers = settings.front_desk_rules.text_missed_callers;
    // The team screen starts from her stage's picks, not the table's all-on default.
  }
  for (const k of Object.keys(out)) if (out[k] === null || out[k] === undefined) delete out[k];
  return out;
}

async function saveProgress(progress: Progress, sql: postgres.Sql): Promise<void> {
  await sql`
    update practice_os.clinician_profile
       set onboarding_answers = onboarding_answers || ${sql.json({ progress } as never)}`;
}

// ---- saving one answer ------------------------------------------------------------

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const optionalDay = isoDay.nullable().optional();
const PROFILE_FIRST = new Set(["name", "practice_name", "state", "license"]);

export class AnswerError extends Error {}

/**
 * Saves a batch of answers (usually one). Name, practice name and state can arrive
 * before her profile exists; they're kept by the browser and sent again with the
 * license type, which creates the profile. Returns plain-words notes to show her.
 */
export async function saveAnswers(
  answers: Record<string, unknown>,
  opts: { current?: string | null } = {},
  sql: postgres.Sql = db(),
): Promise<{ pending: boolean; notes: string[]; state: OnboardingState }> {
  let row = await loadProfileRow(sql);
  const notes: string[] = [];

  if (!row) {
    const ids = Object.keys(answers);
    if (!ids.every((id) => PROFILE_FIRST.has(id))) throw new AnswerError("Please answer the first questions first.");
    if (typeof answers.license !== "string") return { pending: true, notes, state: await loadOnboarding(sql) };
    row = await createProfile(answers, sql);
  } else {
    const basics = Object.fromEntries(Object.entries(answers).filter(([id]) => PROFILE_FIRST.has(id)));
    if (Object.keys(basics).length) row = await updateProfileBasics(row, basics, sql);
  }

  const progress = progressOf(row);
  for (const [id, value] of Object.entries(answers)) {
    if (!PROFILE_FIRST.has(id)) {
      const note = await saveOne(id, value, { ...progress.values, ...answers }, row, sql);
      if (note) notes.push(note);
    }
    progress.values[id] = value;
    progress.skipped = progress.skipped.filter((x) => x !== id);
    progress.later = progress.later.filter((x) => x !== id);
  }
  if (opts.current !== undefined) progress.current = opts.current;
  await saveProgress(progress, sql);
  return { pending: false, notes, state: await loadOnboarding(sql) };
}

/** Skip ("doesn't fit me") or Set up later ("remind me"). */
export async function markSkipped(id: string, how: "skip" | "later", current: string | null, sql: postgres.Sql = db()): Promise<OnboardingState> {
  const row = await loadProfileRow(sql);
  if (!row) return loadOnboarding(sql);
  const p = progressOf(row);
  p.skipped = p.skipped.filter((x) => x !== id);
  p.later = p.later.filter((x) => x !== id);
  (how === "skip" ? p.skipped : p.later).push(id);
  p.current = current;
  await saveProgress(p, sql);
  return loadOnboarding(sql);
}

function licenseLine(name: string, credential: string, isSample: boolean): string {
  return `${name}, ${credential}${isSample ? " (fictional demo practice)" : ""}`;
}

async function createProfile(a: Record<string, unknown>, sql: postgres.Sql): Promise<ProfileRow> {
  const name = z.string().trim().min(1, "Please type your name.").max(120).parse(a.name);
  const credential = z.enum(["LCSW", "LCPC", "LMFT", "Psychologist"]).parse(a.license);
  const state = z.string().regex(/^[A-Z]{2}$/, "Pick your state.").parse(a.state ?? "IL");
  const practice = typeof a.practice_name === "string" && a.practice_name.trim() ? a.practice_name.trim().slice(0, 160) : name;
  await sql.begin(async (tx) => {
    await tx`
      insert into practice_os.clinician_profile
        (full_name, credential, practice_name, city, state, practice_stage, license_line)
      values (${name}, ${credential}, ${practice}, '', ${state}, 'beginning', ${licenseLine(name, credential, false)})`;
    await tx`insert into practice_os.compliance_facts (id) values (true) on conflict (id) do nothing`;
    await tx`insert into practice_os.settings (id, timezone) values (true, ${timezoneFor(state)}) on conflict (id) do nothing`;
    await audit({ actor: "clinician", action: "profile_created", subjectType: "clinician_profile", details: { by: BY, state, credential } }, tx as never);
  });
  const row = (await loadProfileRow(sql))!;
  await syncIdentity(row, sql);
  return row;
}

async function updateProfileBasics(row: ProfileRow, a: Record<string, unknown>, sql: postgres.Sql): Promise<ProfileRow> {
  const name = typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 120) : row.full_name;
  const credential = typeof a.license === "string" ? z.enum(["LCSW", "LCPC", "LMFT", "Psychologist"]).parse(a.license) : row.credential;
  const state = typeof a.state === "string" ? z.string().regex(/^[A-Z]{2}$/, "Pick your state.").parse(a.state) : row.state;
  const practice = typeof a.practice_name === "string" ? a.practice_name.trim().slice(0, 160) || name : row.practice_name;
  await sql`
    update practice_os.clinician_profile
       set full_name = ${name}, credential = ${credential}, state = ${state}, practice_name = ${practice},
           license_line = ${licenseLine(name, credential, row.is_sample)}`;
  if (state !== row.state) await sql`update practice_os.settings set timezone = ${timezoneFor(state)}`;
  await audit({ actor: "clinician", action: "profile_updated", subjectType: "clinician_profile", details: { by: BY, fields: Object.keys(a) } }, sql);
  const next = (await loadProfileRow(sql))!;
  await syncIdentity(next, sql);
  return next;
}

/** Credentialing identity and license mirror the profile, so forms match what she told Aeon. */
async function syncIdentity(row: ProfileRow, sql: postgres.Sql, extra: { email?: string; phone?: string } = {}): Promise<void> {
  const cred = await loadCredentialingProfile(sql);
  await updateCredentialingSection(
    "identity",
    {
      name: row.full_name,
      credential: row.credential,
      practice_name: row.practice_name,
      email: extra.email ?? cred?.identity.email ?? "",
      phone: extra.phone ?? cred?.identity.phone ?? "",
    },
    BY,
    sql,
  );
  // Illinois licenses come from IDFPR; other states' boards are named in state research.
  if (row.state === "IL") {
    await updateCredentialingSection(
      "license",
      { type: row.credential, state: "IL", board: "Illinois Department of Financial and Professional Regulation" },
      BY,
      sql,
    );
  }
}

async function facts(update: FactUpdate): Promise<void> {
  await updateFacts(update, BY);
}

const yesNo = z.boolean({ message: "Pick Yes or No." });
const yesDate = z.object({ yes: yesNo, date: optionalDay }).strict();

async function saveOne(id: string, value: unknown, all: Record<string, unknown>, row: ProfileRow, sql: postgres.Sql): Promise<string | null> {
  if (id.includes(":")) return saveHelper(id, value);
  switch (id) {
    case "contact": {
      const v = z.object({ email: z.string().trim().max(160), phone: z.string().trim().max(40) }).strict().parse(value);
      const email = v.email ? z.string().email("That doesn't look like an email address.").parse(v.email) : "";
      const phone = v.phone ? normalizeUsPhone(v.phone) : "";
      if (phone === null) throw new AnswerError("Please type a 10-digit US phone number.");
      await syncIdentity(row, sql, { email, phone: phone ? formatPhone(phone) : "" });
      return null;
    }
    case "sees_clients": {
      z.enum(["in_person", "telehealth", "both"]).parse(value);
      const cred = await loadCredentialingProfile(sql);
      if (cred?.practiceLocation.address.street) {
        await updateCredentialingSection("practice_location", { ...locationOf(cred), telehealth: value !== "in_person" }, BY, sql);
      }
      return null;
    }
    case "office": {
      const o = z
        .object({
          street: z.string().trim().min(1, "Please type the street address.").max(160),
          city: z.string().trim().min(1, "Please type the city.").max(80),
          state: z.string().regex(/^[A-Z]{2}$/, "Pick the state."),
          zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "A ZIP code is 5 digits."),
          neighborhood: z.string().trim().max(80).optional(),
        })
        .strict()
        .parse(value);
      const cred = await loadCredentialingProfile(sql);
      await updateCredentialingSection(
        "practice_location",
        {
          name: row.practice_name,
          street: o.street,
          city: o.city,
          state: o.state,
          zip: o.zip,
          phone: cred?.identity.phone ?? "",
          telehealth: all.sees_clients ? all.sees_clients !== "in_person" : (cred?.practiceLocation.telehealth ?? false),
        },
        BY,
        sql,
      );
      await sql`update practice_os.clinician_profile set city = ${o.city}, neighborhood = ${o.neighborhood || null}`;
      await facts({ city_code: o.state === "IL" && o.city.toLowerCase() === "chicago" ? "CHI" : null });
      return null;
    }
    case "alert_phone": {
      const phone = normalizeUsPhone(String(value ?? ""));
      if (!phone) throw new AnswerError("Please type a 10-digit US cell number.");
      await sql`update practice_os.settings set alert_phone = ${phone}`;
      await audit({ actor: "clinician", action: "alert_phone_set", subjectType: "settings", details: { by: BY } }, sql);
      return null;
    }
    case "license_expires":
      await facts({ license_expires_on: isoDay.parse(value) });
      return null;
    case "ce": {
      const v = z.object({ first_renewal: yesNo, hours: z.coerce.number().min(0, "Hours can't be below zero.").max(500).optional() }).strict().parse(value);
      await facts({ first_renewal: v.first_renewal, ...(v.first_renewal ? {} : { ce_hours_done: v.hours ?? 0 }) });
      return null;
    }
    case "adults_26":
      await facts({ sees_adults_26_plus: yesNo.parse(value) });
      return null;
    case "psypact": {
      const v = yesDate.parse(value);
      await facts({ has_psypact_apit: v.yes, apit_granted_on: v.yes ? (v.date ?? null) : null });
      return null;
    }
    case "qualified_examiner":
      await facts({ qualified_examiner: yesNo.parse(value) });
      return null;
    case "npi": {
      const npi = String(value ?? "").replace(/\D/g, "");
      const credential = row.credential;
      try {
        await updateCredentialingSection("npi", { npi, npi_type: 1, taxonomy: TAXONOMY[credential] }, BY, sql);
      } catch (err) {
        throw new AnswerError(err instanceof z.ZodError ? "That isn't a valid NPI. It's 10 digits and starts with 1 or 2." : String(err));
      }
      const check = await checkNpiInRegistry(sql).catch(() => null);
      if (check?.found) return "I found your NPI in the national registry.";
      if (check) return "I couldn't match this NPI in the national registry yet. I'll show you what it says on the Credentialing card.";
      return null;
    }
    case "pllc": {
      const v = yesDate.parse(value);
      await facts({ has_pllc: v.yes, pllc_formed_on: v.yes ? (v.date ?? null) : null });
      return null;
    }
    case "entity_tax":
      await facts({ entity_tax: z.enum(["single_owner", "partnership", "s_corp"]).parse(value) });
      return null;
    case "ein": {
      const tin = normalizeEin(String(value ?? ""));
      if (!tin) throw new AnswerError("A tax ID is 9 digits, like 12-3456789.");
      await updateCredentialingSection("tin", { tin }, BY, sql);
      return null;
    }
    case "staff": {
      const v = z.object({ employees: z.coerce.number().int("Use a whole number.").min(0).max(500), contractors: yesNo }).strict().parse(value);
      await facts({ employee_count: v.employees, has_contractors: v.contractors });
      return null;
    }
    case "malpractice": {
      const m = z
        .object({
          carrier: z.string().trim().min(1, "Please type the company's name.").max(160),
          expires_on: isoDay,
          per_claim: z.coerce.number().int().min(0).max(100_000_000),
          aggregate: z.coerce.number().int().min(0).max(100_000_000),
        })
        .strict()
        .parse(value);
      await updateCredentialingSection("malpractice", m, BY, sql);
      return null;
    }
    case "setup": {
      const answers = z.record(z.string().uuid(), z.enum(ANSWERS)).parse(value);
      for (const [obligation, answer] of Object.entries(answers)) await answerSetup(obligation, answer as Answer, "clinician");
      return null;
    }
    case "office_days": {
      const v = z
        .object({ weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day."), close_federal_holidays: z.boolean() })
        .strict()
        .parse(value);
      const current = await loadPracticeSettings(sql);
      await savePracticeSettings({ hours: { ...current.hours, ...v }, fees: current.fees }, "clinician", sql);
      return null;
    }
    case "fees": {
      const fees = z
        .array(z.object({ code: z.string(), label: z.string(), cents: z.coerce.number().int().min(0) }).strict())
        .max(30)
        .parse(value)
        .filter((f) => f.cents > 0);
      const current = await loadPracticeSettings(sql);
      await savePracticeSettings({ hours: current.hours, fees }, "clinician", sql);
      return null;
    }
    case "insurance": {
      const v = z.enum(["self_pay", "some", "planning"]).parse(value);
      await facts({ bills_insurance_electronically: v === "some" });
      await sql`update practice_os.clinician_profile set onboarding_answers = onboarding_answers || ${sql.json({ insurance: INSURANCE_WORDS[v] } as never)}`;
      return null;
    }
    case "payers": {
      const payers = z.array(z.string().trim().min(2).max(120)).max(20).parse(value);
      const have = new Set((await listPayerApplications(sql)).map((p) => p.payer.toLowerCase()));
      for (const payer of payers) if (!have.has(payer.toLowerCase())) await savePayerApplication({ payer, status: "preparing" }, BY, sql);
      return null;
    }
    case "bcbsil":
      await facts({ in_network_bcbsil: yesNo.parse(value) });
      return null;
    case "medicare": {
      const v = z.object({ status: z.enum(["enrolled", "opted_out", "none"]), date: optionalDay }).strict().parse(value);
      await facts({
        medicare: v.status,
        medicare_revalidation_due_on: v.status === "enrolled" ? (v.date ?? null) : null,
        medicare_opt_out_ends_on: v.status === "opted_out" ? (v.date ?? null) : null,
      });
      return null;
    }
    case "medicaid": {
      const v = yesDate.parse(value);
      await facts({ medicaid_enrolled: v.yes, impact_revalidation_due_on: v.yes && row.state === "IL" ? (v.date ?? null) : null });
      return null;
    }
    case "caqh":
      await facts({ caqh_last_attested_on: isoDay.parse(value) });
      return null;
    case "who": {
      const v = z
        .object({ chips: z.array(z.string().max(60)).max(20), work: z.array(z.string().max(60)).max(20), text: z.string().trim().max(400) })
        .strict()
        .parse(value);
      const who = [...v.chips, v.text].filter(Boolean).join("; ");
      const how = v.work.join("; ");
      const patch: Record<string, string> = {};
      if (who) patch.who_i_help = who;
      if (how) patch.how_i_work = how;
      if (!who && !how) return null;
      await sql`update practice_os.clinician_profile set onboarding_answers = onboarding_answers || ${sql.json(patch as never)}`;
      if (who) await remember({ kind: "fact", text: `Works with: ${who}`.slice(0, 500), topic: "referrals" }, { actor: "clinician", source: "onboarding" });
      if (how) await remember({ kind: "preference", text: `Likes to work: ${how}`.slice(0, 500), topic: "working_style" }, { actor: "clinician", source: "onboarding" });
      return null;
    }
    case "followups": {
      const v = z
        .object({ answers: z.array(z.object({ question: z.string().max(200), answer: z.string().trim().max(400), topic: z.string() }).strict()).max(3) })
        .strict()
        .parse(value);
      for (const a of v.answers) {
        if (!a.answer) continue;
        const topic = MEMORY_TOPICS.has(a.topic) ? (a.topic as never) : "working_style";
        await remember({ kind: "fact", text: `${a.question} ${a.answer}`.slice(0, 500), topic }, { actor: "clinician", source: "onboarding" });
      }
      return null;
    }
    case "stage":
      await sql`update practice_os.clinician_profile set practice_stage = ${z.enum(["beginning", "middle", "late"]).parse(value)}`;
      return null;
    case "connect":
      return null; // each Connect card saves its own sign-in
    case "uses_texting":
      await facts({ uses_texting: yesNo.parse(value) });
      return null;
    case "mode": {
      if (!isApprovalMode(value)) throw new AnswerError("Pick one of the three.");
      await saveDefaultMode(value, BY, sql);
      return null;
    }
    case "text_missed_callers":
      await saveFrontDeskRules({ text_missed_callers: yesNo.parse(value) }, BY, sql);
      return null;
    case "team": {
      const ids = HELPERS.map((h) => h.id);
      const v = z.record(z.enum(ids as [HelperId, ...HelperId[]]), z.boolean()).parse(value);
      await sql`update practice_os.settings set helpers_enabled = ${sql.json({ admin: true, referrals: true, instagram: true, front_desk: true, ...v } as never)}`;
      return null;
    }
    default:
      if (!QUESTIONS.some((q) => q.id === id)) throw new AnswerError("Unknown question.");
      return null;
  }
}

const INSURANCE_WORDS = { self_pay: "Self-pay only", some: "Takes some insurance", planning: "Self-pay now, plans to take insurance" } as const;
const MEMORY_TOPICS = new Set(["fees_billing", "schedule", "payers_credentialing", "referrals", "marketing", "admin_compliance", "working_style"]);

async function saveHelper(id: string, value: unknown): Promise<null> {
  const [helper, qid] = id.split(":");
  const block = HELPER_QUESTIONS.find((b) => b.helper === helper);
  if (!block || !block.questions.some((q) => q.id === qid)) throw new AnswerError("Unknown question.");
  await block.save({ [qid]: value });
  return null;
}

function formatPhone(e164: string): string {
  const d = e164.slice(2);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function locationOf(cred: NonNullable<Awaited<ReturnType<typeof loadCredentialingProfile>>>) {
  const l = cred.practiceLocation;
  return { name: l.name, ...l.address, phone: l.phone, telehealth: l.telehealth };
}

// ---- finishing --------------------------------------------------------------------

export async function finishOnboarding(sql: postgres.Sql = db()): Promise<{ researchState: string | null }> {
  const row = await loadProfileRow(sql);
  if (!row) throw new AnswerError("Please answer the first questions first.");
  await sql`update practice_os.clinician_profile set onboarding_completed_at = coalesce(onboarding_completed_at, now())`;
  await audit({ actor: "clinician", action: "onboarding_finished", subjectType: "clinician_profile", details: { by: BY } }, sql);
  return { researchState: row.state === "IL" ? null : row.state };
}

/** What she skipped or put off, for the "Still to set up" card on the home page. */
export async function stillToSetUp(sql: postgres.Sql = db()): Promise<{ id: string; ask: string; why: string | null; chapter: string }[]> {
  const row = await loadProfileRow(sql);
  if (!row?.onboarding_completed_at) return [];
  const p = progressOf(row);
  const screens = screensFor(p.values, row);
  const open = new Set([...p.later, ...p.skipped.filter((id) => QUESTIONS.find((q) => q.id === id)?.blocks)]);
  return screens
    .filter((s) => open.has(s.id))
    .map((s) => ({
      id: s.id,
      ask: s.ask,
      why: QUESTIONS.find((q) => q.id === s.id)?.blocks ?? null,
      chapter: CHAPTERS.find((c) => c.id === s.chapter)!.title,
    }));
}
