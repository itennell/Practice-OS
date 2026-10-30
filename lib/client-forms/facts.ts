import type { CredentialingProfile } from "../credentialing/profile";
import type { Fee } from "../gfe/store";
import { DEFAULT_POLICIES, fillIn, type Policies, type PracticeFacts } from "./types";

// Her practice facts for the templates, from what Practice-OS already holds: the
// credentialing profile (name, address, phone, license type), Office hours and
// fees, and the policies she sets on the library. Nothing about any client.

export function practiceFacts(p: CredentialingProfile, fees: Fee[], policies: Partial<Policies>, today: string, policiesSaved = false): PracticeFacts {
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
    // A fee of $0 is not a fee she has set.
    fees: fees.filter((f) => f.cents > 0).map(({ code, label, cents }) => ({ code, label, cents })),
    policies: { ...DEFAULT_POLICIES, ...policies },
    policiesSaved,
    isSample: p.isSample,
    today,
  };
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** "Dana Reyes, LCPC (fictional demo practice)". */
export const signedBy = (f: PracticeFacts) => `${f.therapist}, ${f.credential}${f.isSample ? " (fictional demo practice)" : ""}`;

export const fullAddress = (f: PracticeFacts) => `${f.street}, ${f.city}, ${f.state} ${f.zip}`;

/** The templates are written for Illinois law; other states' rules haven't been researched yet. */
export const isIllinois = (f: PracticeFacts) => f.state.trim().toUpperCase() === "IL" || /^illinois$/i.test(f.state.trim());

/** Licensed marriage and family therapist: 405 ILCS 5/3-550(c) does not name this license. */
export const isLmft = (f: PracticeFacts) => /LMFT|MARRIAGE/.test(`${f.credential} ${f.licenseType}`.toUpperCase());

/** Her reply time, or a gap to fill. */
export const replyHours = (f: PracticeFacts) => (f.policies.reply_within_hours ? String(f.policies.reply_within_hours) : fillIn("hours"));

/** Which ethics code her license follows, for the consent forms. */
export function ethicsCode(f: PracticeFacts): string {
  const c = `${f.credential} ${f.licenseType}`.toUpperCase();
  if (/LCSW|LSW|SOCIAL/.test(c)) return "the NASW Code of Ethics";
  if (/LMFT|MARRIAGE/.test(c)) return "the AAMFT Code of Ethics";
  if (/PSYCHOLOG|PSYD|PHD/.test(c)) return "the APA Ethical Principles of Psychologists and Code of Conduct";
  return "the ACA Code of Ethics";
}
