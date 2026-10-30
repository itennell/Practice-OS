import type postgres from "postgres";
import { z } from "zod";
import { REFUSAL, guard } from "../aeon/guard";
import { audit } from "../audit";
import { practiceToday } from "../compliance/store";
import { DANA_PROFILE } from "../credentialing/demo";
import type { CredentialingProfile } from "../credentialing/profile";
import { loadCredentialingProfile } from "../credentialing/store";
import { db } from "../db";
import { loadPracticeSettings } from "../gfe/store";
import { practiceFacts } from "./facts";
import { getForm, prepare } from "./index";
import type { Overrides } from "./render";
import { policiesSchema, type FormId, type Policies, type PracticeFacts } from "./types";

// Her wording for the client forms library (practice_os.client_form_templates,
// migration 034). Only practice-level text: a client's answers never reach here.
// Every edit passes the sensitive-info guard (no client names or details) and the
// required-elements check before it is saved, and each save is audited by form
// type only, never the text.

const overridesSchema = z
  .object({
    clauses: z.record(z.string().regex(/^[a-z0-9_]{1,40}$/), z.string().max(2000)).optional(),
    extra: z.string().max(2000).optional(),
  })
  .strict();

export async function loadPolicies(sql: postgres.Sql = db()): Promise<Partial<Policies>> {
  const [row] = await sql<{ overrides: unknown }[]>`select overrides from practice_os.client_form_templates where form_type = '_practice'`;
  const parsed = policiesSchema.partial().safeParse(row?.overrides ?? {});
  return parsed.success ? parsed.data : {};
}

export async function loadOverrides(form: FormId, sql: postgres.Sql = db()): Promise<Overrides> {
  const [row] = await sql<{ overrides: unknown }[]>`select overrides from practice_os.client_form_templates where form_type = ${form}`;
  const parsed = overridesSchema.safeParse(row?.overrides ?? {});
  return parsed.success ? parsed.data : {};
}

/** Everything a template needs, or null before she has a practice profile. */
export async function loadFacts(sql: postgres.Sql = db()): Promise<{ facts: PracticeFacts; profile: CredentialingProfile } | null> {
  const [profile, settings, policies, today] = await Promise.all([loadCredentialingProfile(sql), loadPracticeSettings(sql), loadPolicies(sql), practiceToday()]);
  if (!profile) return null;
  return { facts: practiceFacts(profile, settings.fees, policies, today), profile };
}

async function upsert(form: string, value: object, sql: postgres.Sql) {
  await sql`
    insert into practice_os.client_form_templates (form_type, overrides) values (${form}, ${sql.json(value as never)})
    on conflict (form_type) do update set overrides = excluded.overrides, updated_at = now()`;
}

async function refuseClientDetails(texts: string[]) {
  for (const t of texts.filter((x) => x.trim())) {
    const g = await guard(t, "memory");
    if (!g.ok) throw new Error(`${REFUSAL[g.kind]} Templates hold your practice's wording only, never a client's details.`);
  }
}

export async function savePolicies(input: unknown, sql: postgres.Sql = db()): Promise<Partial<Policies>> {
  const next = policiesSchema.partial().parse(input);
  // The privacy contact and backup colleague are professionals named on purpose; the fee note is free text.
  await refuseClientDetails([next.records_fee_note ?? ""]);
  const merged = { ...(await loadPolicies(sql)), ...next };
  await upsert("_practice", merged, sql);
  await audit({ actor: "clinician", action: "client_form_policies_saved", subjectType: "client_form", subjectId: "_practice", details: { keys: Object.keys(next) } }, sql);
  return merged;
}

/** Saves her edits only if every required element is still on the form. */
export async function saveOverrides(form: FormId, input: unknown, sql: postgres.Sql = db()) {
  const def = getForm(form);
  if (!def) throw new Error("No such form.");
  const next = overridesSchema.parse(input);
  const editable = new Set(def.build(practiceFacts(...demoArgs())).flatMap((b) => (b.kind === "clause" && b.editable ? [b.id] : [])));
  const clauses = Object.fromEntries(Object.entries(next.clauses ?? {}).filter(([id]) => editable.has(id)));
  const clean: Overrides = { clauses, extra: next.extra };
  await refuseClientDetails([...Object.values(clauses), next.extra ?? ""]);
  const loaded = await loadFacts(sql);
  if (!loaded) throw new Error("Add your practice details on Admin › Credentialing first.");
  const { check } = prepare(def, loaded.facts, clean);
  if (!check.ok) throw new Error(`That edit takes out something the form must say: ${check.missing.map((m) => `${m.label} (${m.citation})`).join("; ")}.`);
  await upsert(form, clean, sql);
  await audit({ actor: "clinician", action: "client_form_edited", subjectType: "client_form", subjectId: form, details: { clauses: Object.keys(clauses), extra: Boolean(next.extra?.trim()) } }, sql);
  return { overrides: clean, check };
}

export async function resetOverrides(form: FormId, sql: postgres.Sql = db()) {
  await sql`delete from practice_os.client_form_templates where form_type = ${form}`;
  await audit({ actor: "clinician", action: "client_form_reset", subjectType: "client_form", subjectId: form }, sql);
}

// Which clauses are editable never depends on her facts; any profile works to list them.
const demoArgs = (): Parameters<typeof practiceFacts> => [DANA_PROFILE, [], {}, "2026-01-01"];
