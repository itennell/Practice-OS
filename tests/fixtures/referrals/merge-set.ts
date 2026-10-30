// A labeled set for the provider matcher (lib/referrals/evidence/match.ts):
// pairs of records as different sources write them, and whether they are the
// same provider. All made up: fake names, 555 phones, NPIs starting 19 (not
// issued). The cases are the ways real lists differ: titles and credentials,
// middle initials, "Last, First", hyphens and accents, street suffixes and
// directionals, suite numbers, a group's "LLC", and the hard negatives
// (same building, same last name, same name across town, a different NPI).
import type { Candidate } from "../../../lib/referrals/evidence/match";

export type LabeledPair = { why: string; a: Candidate; b: Candidate; same: boolean };

const card = (over: Partial<Candidate>): Candidate => ({
  name: "Maria Rivera, MD",
  street: "2400 N Lincoln Ave, Suite 210",
  city: "Chicago",
  zip: "60614",
  phone: "312-555-0100",
  ...over,
});

export const MERGE_SET: LabeledPair[] = [
  // Same provider.
  { why: "same NPI", a: card({ npi: "1900000001" }), b: { npi: "1900000001", name: "M Rivera" }, same: true },
  { why: "title and credential", a: card({}), b: { name: "Dr. Maria Rivera", street: "2400 N Lincoln Ave", zip: "60614" }, same: true },
  { why: "middle initial", a: card({}), b: { name: "Maria L. Rivera MD", street: "2400 North Lincoln Avenue", zip: "60614-3301" }, same: true },
  { why: "last name first", a: card({}), b: { name: "RIVERA, MARIA", street: "2400 N LINCOLN AVE STE 210", zip: "60614" }, same: true },
  { why: "suite differs", a: card({}), b: { name: "Maria Rivera", street: "2400 N Lincoln Ave Suite 300", zip: "60614" }, same: true },
  { why: "phone match, other street", a: card({}), b: { name: "Maria Rivera", street: "PO Box 1180", zip: "60690", phone: "(312) 555-0100" }, same: true },
  { why: "accent and hyphen", a: card({ name: "José Núñez-Ortiz, LCSW" }), b: { name: "Jose Nunez Ortiz", street: "2400 N. Lincoln Ave.", zip: "60614" }, same: true },
  { why: "typo in last name", a: card({ name: "Katherine Oyelaran, DO" }), b: { name: "Katherine Oyelarin", street: "2400 N Lincoln Ave", zip: "60614" }, same: true },
  { why: "typo in first name", a: card({ name: "Jonathan Pell, PsyD" }), b: { name: "Johnathan Pell", street: "2400 N Lincoln", zip: "60614" }, same: true },
  { why: "city-only list (state license)", a: card({ name: "Priya Das, LCPC" }), b: { name: "DAS, PRIYA", city: "CHICAGO" }, same: true },
  { why: "1 prefix on phone", a: card({ name: "Ana Bell" }), b: { name: "Ana Bell", phone: "+1 312 555 0100" }, same: true },
  { why: "nickname (Tom), street spelled out", a: card({ name: "Tom Hale", street: "1 East Erie Street", zip: "60611" }), b: { name: "Thomas Hale", street: "1 E Erie St", zip: "60611" }, same: true },
  { why: "group, LLC dropped", a: { isOrg: true, name: "Northside Family Medicine LLC", street: "3100 N Clark St", zip: "60657" }, b: { isOrg: true, name: "Northside Family Medicine", street: "3100 North Clark Street", zip: "60657" }, same: true },
  { why: "group, longer sign name", a: { isOrg: true, name: "Lakeview Pediatrics", street: "900 W Belmont Ave", zip: "60657" }, b: { isOrg: true, name: "Lakeview Pediatrics Associates", street: "900 W Belmont", zip: "60657" }, same: true },
  { why: "group, ampersand", a: { isOrg: true, name: "Oak & Elm OB-GYN, PC", phone: "773-555-0142" }, b: { isOrg: true, name: "Oak and Elm OB GYN", phone: "7735550142" }, same: true },
  { why: "credential after comma only", a: card({ name: "Lena Brooks, LCSW, LCPC" }), b: { name: "Lena Brooks", street: "2400 N Lincoln Ave", zip: "60614" }, same: true },
  { why: "two first names", a: card({ name: "Mary Ann Kowal" }), b: { name: "Mary Kowal", street: "2400 N Lincoln Ave", zip: "60614" }, same: true },
  { why: "same NPI, name changed (married)", a: card({ npi: "1900000002", name: "Sara Lund" }), b: { npi: "1900000002", name: "Sara Lund-Hart" }, same: true },

  // Different providers.
  { why: "different NPI, same name", a: card({ npi: "1900000003" }), b: { npi: "1900000004", name: "Maria Rivera", street: "2400 N Lincoln Ave", zip: "60614" }, same: false },
  { why: "same building, other doctor", a: card({}), b: { name: "Daniel Okafor, MD", street: "2400 N Lincoln Ave, Suite 210", zip: "60614" }, same: false },
  { why: "same last name, other first", a: card({}), b: { name: "Marcus Rivera", street: "2400 N Lincoln Ave", zip: "60614" }, same: false },
  { why: "same name across town", a: card({}), b: { name: "Maria Rivera", street: "8800 S Cottage Grove Ave", zip: "60619" }, same: false },
  { why: "same name, other city (license list)", a: card({}), b: { name: "Maria Rivera", city: "Peoria" }, same: false },
  { why: "same name, no address", a: card({}), b: { name: "Maria Rivera" }, same: false },
  { why: "spelling variant of last name (Larsen, Larson)", a: card({ name: "Ann Larsen" }), b: { name: "Ann Larson", street: "2400 N Lincoln Ave", zip: "60614" }, same: true },
  { why: "different house number", a: card({}), b: { name: "Maria Rivera", street: "2440 N Lincoln Ave", zip: "60614" }, same: false },
  { why: "different ZIP same street", a: card({}), b: { name: "Maria Rivera", street: "2400 N Lincoln Ave", zip: "60618" }, same: false },
  { why: "groups, different names, same address", a: { isOrg: true, name: "Northside Family Medicine", street: "3100 N Clark St", zip: "60657" }, b: { isOrg: true, name: "Clark Street Imaging", street: "3100 N Clark St", zip: "60657" }, same: false },
  { why: "groups, similar names, other address", a: { isOrg: true, name: "Lakeview Pediatrics", street: "900 W Belmont Ave", zip: "60657" }, b: { isOrg: true, name: "Lakeview Pediatrics", street: "4500 N Sheridan Rd", zip: "60640" }, same: false },
  { why: "nickname (Bob)", a: card({ name: "Robert Szabo, MD" }), b: { name: "Bob Szabo", street: "2400 N Lincoln Ave", zip: "60614" }, same: true },
  { why: "first initial only, other address", a: card({}), b: { name: "M Rivera", street: "100 W Madison St", zip: "60602" }, same: false },
  { why: "siblings, same practice", a: card({ name: "Elena Marsh, MD" }), b: { name: "Ethan Marsh, MD", street: "2400 N Lincoln Ave", zip: "60614" }, same: false },
];
