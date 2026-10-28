// Her Referrals setup (practice_os.referral_settings, one row): the ZIP to
// search around and the kinds of referral sources she wants. Onboarding asks
// for it; the search tool and the board's Find form use it when she doesn't say.
import type postgres from "postgres";
import { audit } from "../audit";
import { db } from "../db";
import { SPECIALTY_BY_ID, type SpecialtyId } from "./nppes";

export type ReferralSettings = {
  homeZip: string | null;
  /** Her office ZIP from credentialing (onboarding chapter 1). */
  officeZip: string | null;
  /** What to search around: the ZIP she gave Referrals, else her office's. */
  searchZip: string | null;
  specialties: SpecialtyId[];
};

export const DEFAULT_SPECIALTIES: SpecialtyId[] = ["family_medicine", "internal_medicine"];

export async function getReferralSettings(sql: postgres.Sql = db()): Promise<ReferralSettings> {
  const [row] = await sql<{ home_zip: string | null; specialties: string[] }[]>`
    select home_zip, specialties from practice_os.referral_settings where id`;
  const [office] = await sql<{ zip: string | null }[]>`
    select practice_location ->> 'zip' as zip from practice_os.credentialing_profile limit 1`.catch(() => []);
  const officeZip = office?.zip && /^\d{5}/.test(office.zip) ? office.zip.slice(0, 5) : null;
  const homeZip = row?.home_zip ?? null;
  return {
    homeZip,
    officeZip,
    searchZip: homeZip ?? officeZip,
    specialties: (row?.specialties ?? []).filter((s): s is SpecialtyId => SPECIALTY_BY_ID.has(s as SpecialtyId)),
  };
}

/** Saves what she gave; a field left out keeps its saved value. Throws in plain words on bad input. */
export async function saveReferralSettings(input: { homeZip?: string | null; specialties?: string[] }, sql: postgres.Sql = db()) {
  const zip = input.homeZip?.trim() || null;
  if (zip !== null && !/^\d{5}$/.test(zip)) throw new Error("Type your 5-digit ZIP code.");
  if (input.specialties?.some((s) => !SPECIALTY_BY_ID.has(s as SpecialtyId))) throw new Error("Pick from the list.");
  const specialties = input.specialties ? [...new Set(input.specialties)] : null;
  await sql`
    insert into practice_os.referral_settings (id, home_zip, specialties)
    values (true, ${zip}, ${specialties ?? []})
    on conflict (id) do update set
      home_zip = ${input.homeZip === undefined ? sql`referral_settings.home_zip` : sql`excluded.home_zip`},
      specialties = ${specialties === null ? sql`referral_settings.specialties` : sql`excluded.specialties`},
      updated_at = now()`;
  await audit({ actor: "clinician", action: "referral_settings_saved", subjectType: "referral_settings", details: { homeZip: zip, specialties } }, sql);
}
