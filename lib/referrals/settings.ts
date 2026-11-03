// Her Referrals setup (practice_os.referral_settings, one row): the ZIP to
// search around, the kinds of referral sources she wants and her niche (a
// preset from the source catalog that weights the tiers, lib/referrals/tier.ts).
// Onboarding asks for it; the search tool and the board's Find form use it when she doesn't say.
import type postgres from "postgres";
import { audit } from "../audit";
import { db } from "../db";
import { isNichePreset, NICHE_PRESETS, SOURCE_TYPE_BY_ID, typesForNiche } from "./catalog";
import { SPECIALTY_BY_ID, type SpecialtyId } from "./nppes";

export type ReferralSettings = {
  homeZip: string | null;
  /** Her office ZIP from credentialing (onboarding chapter 1). */
  officeZip: string | null;
  /** What to search around: the ZIP she gave Referrals, else her office's. */
  searchZip: string | null;
  specialties: SpecialtyId[];
  /** Her niche preset id (catalog niche_presets), or null for none. */
  nichePreset: string | null;
};

export const DEFAULT_SPECIALTIES: SpecialtyId[] = ["family_medicine", "internal_medicine"];

/** The niches she can pick, in the catalog's order. */
export const NICHE_OPTIONS: { value: string; label: string }[] = NICHE_PRESETS.map((p) => ({ value: p.id, label: p.label }));

/** How many kinds picking a niche pre-selects; she can change them. */
export const NICHE_TOP_SPECIALTIES = 6;

/**
 * The NPI Registry kinds a niche picks first: the catalog's best-weighted source
 * types that are themselves a search kind (so "fertility" doesn't pick every OB/GYN).
 */
export function specialtiesForNiche(preset: string, max = NICHE_TOP_SPECIALTIES): SpecialtyId[] {
  return typesForNiche(preset)
    .map((t) => t.type.id)
    .filter((id): id is SpecialtyId => SPECIALTY_BY_ID.has(id as SpecialtyId))
    .slice(0, max);
}

export async function getReferralSettings(sql: postgres.Sql = db()): Promise<ReferralSettings> {
  const [row] = await sql<{ home_zip: string | null; specialties: string[] }[]>`
    select home_zip, specialties from practice_os.referral_settings where id`;
  // Its own query: a database without migration 043 still reads the rest.
  const [niche] = await sql<{ niche_preset: string | null }[]>`select niche_preset from practice_os.referral_settings where id`.catch(() => []);
  const [office] = await sql<{ zip: string | null }[]>`
    select practice_location ->> 'zip' as zip from practice_os.credentialing_profile limit 1`.catch(() => []);
  const officeZip = office?.zip && /^\d{5}/.test(office.zip) ? office.zip.slice(0, 5) : null;
  const homeZip = row?.home_zip ?? null;
  return {
    homeZip,
    officeZip,
    searchZip: homeZip ?? officeZip,
    specialties: (row?.specialties ?? []).filter((s): s is SpecialtyId => SPECIALTY_BY_ID.has(s as SpecialtyId)),
    nichePreset: niche?.niche_preset && isNichePreset(niche.niche_preset) ? niche.niche_preset : null,
  };
}

/** Saves what she gave; a field left out keeps its saved value. Throws in plain words on bad input. */
export async function saveReferralSettings(
  input: { homeZip?: string | null; specialties?: string[]; nichePreset?: string | null },
  sql: postgres.Sql = db(),
  actor: "clinician" | "aeon" = "clinician",
) {
  const zip = input.homeZip?.trim() || null;
  if (zip !== null && !/^\d{5}$/.test(zip)) throw new Error("Type your 5-digit ZIP code.");
  // The database only checks an id's shape (migration 043); the list itself is checked here, against the catalog.
  if (input.specialties?.some((s) => !SPECIALTY_BY_ID.has(s as SpecialtyId) || (SOURCE_TYPE_BY_ID.size > 0 && !SOURCE_TYPE_BY_ID.has(s)))) throw new Error("Pick from the list.");
  const niche = input.nichePreset ?? null;
  if (niche !== null && !isNichePreset(niche)) throw new Error("Pick a niche from the list.");
  const specialties = input.specialties ? [...new Set(input.specialties)] : null;
  await sql`
    insert into practice_os.referral_settings (id, home_zip, specialties)
    values (true, ${zip}, ${specialties ?? []})
    on conflict (id) do update set
      home_zip = ${input.homeZip === undefined ? sql`referral_settings.home_zip` : sql`excluded.home_zip`},
      specialties = ${specialties === null ? sql`referral_settings.specialties` : sql`excluded.specialties`},
      updated_at = now()`;
  // Only when she gave one, so a database without migration 043 still saves the rest.
  // Saved scores carry the niche they were weighted for (tier.ts scoreVersionFor), so a new niche
  // makes them stale on its own and the board scores them again (store.ts rescoreOldCards).
  if (input.nichePreset !== undefined) await sql`update practice_os.referral_settings set niche_preset = ${niche}, updated_at = now() where id`;
  await audit(
    {
      actor,
      action: "referral_settings_saved",
      subjectType: "referral_settings",
      details: { homeZip: zip, specialties, ...(input.nichePreset !== undefined ? { nichePreset: niche } : {}) },
    },
    sql,
  );
}
