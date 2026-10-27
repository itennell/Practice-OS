import type postgres from "postgres";
import { z } from "zod";
import { audit } from "../audit";
import { toDate } from "../compliance/dates";
import { db } from "../db";
import { isValidNpi, TAXONOMY_LABEL, type CredentialingProfile, type NpiCheck } from "./profile";

// Her saved credentialing profile (practice_os.credentialing_profile, migration
// 007). One row, edited one CAQH section at a time, from the Credentialing tab or
// by Aeon (update_credentialing). Never a license number; never anything about a client.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
  try {
    toDate(d);
    return true;
  } catch {
    return false;
  }
}, "Not a real date");
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max);

/** Refuses anything that looks like a license number inside the license section. */
const noLicenseNumber = (v: Record<string, unknown>) =>
  !Object.keys(v).some((k) => /number|^no$|license_?no/i.test(k)) &&
  !Object.values(v).some((x) => typeof x === "string" && /\b\d{3}\.\d{6}\b/.test(x));

export const SECTIONS = {
  identity: z
    .object({ name: text(120), credential: text(40), practice_name: text(160), email: optionalText(160), phone: optionalText(40) })
    .strict(),
  education: z.array(z.object({ degree: text(160), school: text(160), graduated: z.number().int().min(1950).max(2100) }).strict()).max(10),
  license: z
    .object({ type: text(160), state: z.string().regex(/^[A-Z]{2}$/), board: text(200) })
    .strict()
    .refine(noLicenseNumber, "Practice-OS doesn't store license numbers."),
  npi: z
    .object({
      npi: z.string().refine(isValidNpi, "Not a valid NPI (10 digits, starts with 1 or 2, check digit must match)."),
      npi_type: z.union([z.literal(1), z.literal(2)]),
      taxonomy: z.string().regex(/^[0-9A-Z]{10}$/, "A 10-character taxonomy code, e.g. 101YP2500X"),
    })
    .strict(),
  tin: z.object({ tin: z.string().regex(/^\d{2}-\d{7}$/, "Tax ID as 12-3456789") }).strict(),
  malpractice: z
    .object({
      carrier: text(160),
      per_claim: z.number().int().min(0).max(100_000_000),
      aggregate: z.number().int().min(0).max(100_000_000),
      expires_on: isoDate,
    })
    .strict(),
  practice_location: z
    .object({
      name: text(160),
      street: text(160),
      city: text(80),
      state: z.string().regex(/^[A-Z]{2}$/),
      zip: z.string().regex(/^\d{5}(-\d{4})?$/),
      phone: optionalText(40),
      telehealth: z.boolean(),
    })
    .strict(),
  work_history: z
    .object({
      jobs: z.array(z.object({ employer: text(160), role: text(120), from: isoDate, to: isoDate.nullable() }).strict()).max(30),
      gaps: z.array(z.object({ from: isoDate, to: isoDate, reason: text(300) }).strict()).max(30),
    })
    .strict(),
  documents: z
    .array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9_]{1,40}$/),
          label: text(120),
          upload: text(200),
          on_file: z.boolean(),
          expires_on: isoDate.nullable(),
        })
        .strict(),
    )
    .max(30),
} as const;

export type SectionName = keyof typeof SECTIONS;
export const SECTION_NAMES = Object.keys(SECTIONS) as SectionName[];

type Row = Record<string, unknown>;

function toProfile(r: Row): CredentialingProfile {
  const id = (r.identity ?? {}) as Record<string, string>;
  const lic = (r.license ?? {}) as Record<string, string>;
  const mal = (r.malpractice ?? {}) as Record<string, unknown>;
  const loc = (r.practice_location ?? {}) as Record<string, unknown>;
  const check = r.npi_check as Omit<NpiCheck, "checkedAt"> | null;
  const taxonomy = (r.taxonomy as string | null) ?? "";
  return {
    identity: { name: id.name ?? "", credential: id.credential ?? "", practiceName: id.practice_name ?? "", email: id.email ?? "", phone: id.phone ?? "" },
    education: (r.education as CredentialingProfile["education"]) ?? [],
    license: { type: lic.type ?? "", state: lic.state ?? "", board: lic.board ?? "", numberStored: false },
    npi: {
      number: (r.npi as string | null) ?? "",
      type: ((r.npi_type as number | null) ?? 1) as 1 | 2,
      taxonomy,
      taxonomyLabel: TAXONOMY_LABEL[taxonomy] ?? taxonomy,
    },
    tin: (r.tin as string | null) ?? null,
    npiCheck: check && r.npi_checked_at ? { ...check, checkedAt: new Date(r.npi_checked_at as string).toISOString() } : null,
    malpractice: {
      carrier: (mal.carrier as string) ?? "",
      perClaim: Number(mal.per_claim ?? 0),
      aggregate: Number(mal.aggregate ?? 0),
      expiresOn: (mal.expires_on as string) ?? "",
    },
    practiceLocation: {
      name: (loc.name as string) ?? "",
      address: { street: (loc.street as string) ?? "", city: (loc.city as string) ?? "", state: (loc.state as string) ?? "", zip: (loc.zip as string) ?? "" },
      phone: (loc.phone as string) ?? "",
      telehealth: Boolean(loc.telehealth),
    },
    workHistory: (r.work_history as CredentialingProfile["workHistory"]) ?? [],
    gapExplanations: (r.gap_explanations as CredentialingProfile["gapExplanations"]) ?? [],
    documents: ((r.documents as Row[]) ?? []).map((d) => ({
      id: d.id as string,
      label: d.label as string,
      upload: d.upload as string,
      onFile: Boolean(d.on_file),
      expiresOn: (d.expires_on as string | null) ?? null,
    })),
    isSample: Boolean(r.is_sample),
  };
}

/** The section values as stored, for prefilling an edit form or an agent's update. */
export function sectionValues(p: CredentialingProfile): { [K in SectionName]: z.infer<(typeof SECTIONS)[K]> } {
  return {
    identity: { name: p.identity.name, credential: p.identity.credential, practice_name: p.identity.practiceName, email: p.identity.email, phone: p.identity.phone },
    education: p.education,
    license: { type: p.license.type, state: p.license.state, board: p.license.board },
    npi: { npi: p.npi.number, npi_type: p.npi.type, taxonomy: p.npi.taxonomy },
    tin: { tin: p.tin ?? "" },
    malpractice: { carrier: p.malpractice.carrier, per_claim: p.malpractice.perClaim, aggregate: p.malpractice.aggregate, expires_on: p.malpractice.expiresOn },
    practice_location: { name: p.practiceLocation.name, ...p.practiceLocation.address, phone: p.practiceLocation.phone, telehealth: p.practiceLocation.telehealth },
    work_history: { jobs: p.workHistory, gaps: p.gapExplanations },
    documents: p.documents.map((d) => ({ id: d.id, label: d.label, upload: d.upload, on_file: d.onFile, expires_on: d.expiresOn })),
  };
}

/** A blank profile, so the page and Aeon can start filling one in. */
export function emptyCredentialingProfile(): CredentialingProfile {
  return toProfile({});
}

export async function loadCredentialingProfile(sql: postgres.Sql = db()): Promise<CredentialingProfile | null> {
  const [row] = await sql`select * from practice_os.credentialing_profile where id`;
  return row ? toProfile(row) : null;
}

/** Validates and saves one section, then audits which section changed (not its values). */
export async function updateCredentialingSection(
  section: string,
  value: unknown,
  by: string,
  sql: postgres.Sql = db(),
): Promise<CredentialingProfile> {
  if (!(section in SECTIONS)) throw new Error(`Unknown section. Use one of: ${SECTION_NAMES.join(", ")}.`);
  const name = section as SectionName;
  const v = SECTIONS[name].parse(value) as Record<string, unknown>;
  await sql`insert into practice_os.credentialing_profile (id) values (true) on conflict (id) do nothing`;
  if (name === "npi") {
    const n = v as { npi: string; npi_type: number; taxonomy: string };
    // A new NPI clears the old registry check.
    await sql`update practice_os.credentialing_profile
                 set npi = ${n.npi}, npi_type = ${n.npi_type}, taxonomy = ${n.taxonomy},
                     npi_check = case when npi is distinct from ${n.npi} then null else npi_check end,
                     npi_checked_at = case when npi is distinct from ${n.npi} then null else npi_checked_at end
               where id`;
  } else if (name === "tin") {
    await sql`update practice_os.credentialing_profile set tin = ${(v as { tin: string }).tin} where id`;
  } else if (name === "work_history") {
    const w = v as { jobs: unknown; gaps: unknown };
    await sql`update practice_os.credentialing_profile
                 set work_history = ${sql.json(w.jobs as never)}, gap_explanations = ${sql.json(w.gaps as never)} where id`;
  } else {
    await sql`update practice_os.credentialing_profile set ${sql(name)} = ${sql.json(v as never)} where id`;
  }
  await audit({ actor: by === "clinician" ? "clinician" : "aeon", action: "credentialing_updated", subjectType: "credentialing_profile", details: { section: name, by } }, sql);
  return (await loadCredentialingProfile(sql))!;
}

const NPPES = "https://npiregistry.cms.hhs.gov/api/?version=2.1&number=";

/** Looks her NPI up in the public NPPES registry and saves what it found. */
export async function checkNpiInRegistry(sql: postgres.Sql = db(), fetchImpl: typeof fetch = fetch): Promise<NpiCheck> {
  const p = await loadCredentialingProfile(sql);
  if (!p?.npi.number) throw new Error("Add your NPI first.");
  const res = await fetchImpl(`${NPPES}${p.npi.number}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`NPPES didn't answer (HTTP ${res.status}). Try again later.`);
  const body = (await res.json()) as {
    result_count?: number;
    results?: { basic?: { first_name?: string; last_name?: string; organization_name?: string }; taxonomies?: { code: string; primary: boolean }[] }[];
  };
  const hit = body.results?.[0];
  const primary = hit?.taxonomies?.find((t) => t.primary)?.code ?? hit?.taxonomies?.[0]?.code ?? null;
  const name = hit ? (hit.basic?.organization_name ?? [hit.basic?.first_name, hit.basic?.last_name].filter(Boolean).join(" ")) || null : null;
  const check: Omit<NpiCheck, "checkedAt"> = {
    found: Boolean(body.result_count && hit),
    name,
    taxonomy: primary,
    matches: Boolean(hit) && primary === p.npi.taxonomy,
  };
  const [row] = await sql<{ npi_checked_at: Date }[]>`
    update practice_os.credentialing_profile set npi_check = ${sql.json(check as never)}, npi_checked_at = now()
     where id returning npi_checked_at`;
  await audit({ actor: "aeon", action: "npi_checked", subjectType: "credentialing_profile", details: { found: check.found, matches: check.matches } }, sql);
  return { ...check, checkedAt: row.npi_checked_at.toISOString() };
}
