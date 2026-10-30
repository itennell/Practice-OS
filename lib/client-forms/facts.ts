import type { CredentialingProfile } from "../credentialing/profile";
import type { Fee } from "../gfe/store";
import { DEFAULT_POLICIES, type Policies, type PracticeFacts } from "./types";

// Her practice facts for the templates, from what Practice-OS already holds: the
// credentialing profile (name, address, phone, license type), Office hours and
// fees, and the policies she sets on the library. Nothing about any client.

export function practiceFacts(p: CredentialingProfile, fees: Fee[], policies: Partial<Policies>, today: string): PracticeFacts {
  const a = p.practiceLocation.address;
  return {
    practiceName: p.identity.practiceName,
    therapist: p.identity.name,
    credential: p.identity.credential,
    licenseType: p.license.type,
    board: p.license.board,
    street: a.street,
    city: a.city,
    state: a.state,
    zip: a.zip,
    phone: p.practiceLocation.phone || p.identity.phone,
    email: p.identity.email,
    telehealth: p.practiceLocation.telehealth,
    fees: fees.map(({ code, label, cents }) => ({ code, label, cents })),
    policies: { ...DEFAULT_POLICIES, ...policies },
    isSample: p.isSample,
    today,
  };
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** "Dana Reyes, LCPC (fictional demo practice)". */
export const signedBy = (f: PracticeFacts) => `${f.therapist}, ${f.credential}${f.isSample ? " (fictional demo practice)" : ""}`;

export const fullAddress = (f: PracticeFacts) => `${f.street}, ${f.city}, ${f.state} ${f.zip}`;

/** Which ethics code her license follows, for the consent forms. */
export function ethicsCode(f: PracticeFacts): string {
  const c = `${f.credential} ${f.licenseType}`.toUpperCase();
  if (/LCSW|LSW|SOCIAL/.test(c)) return "the NASW Code of Ethics";
  if (/LMFT|MARRIAGE/.test(c)) return "the AAMFT Code of Ethics";
  if (/PSYCHOLOG|PSYD|PHD/.test(c)) return "the APA Ethical Principles of Psychologists and Code of Conduct";
  return "the ACA Code of Ethics";
}
