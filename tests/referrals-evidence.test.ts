// Referrals v2: matching a provider across sources, merging what each source
// says, confidence and conflicts. Plain code, no network, no database.
import { describe, expect, it } from "vitest";
import { matchCandidate, orgNameScore, personNameScore } from "../lib/referrals/evidence/match";
import { mergeEvidence, mergeField, valueKey, type Fact } from "../lib/referrals/evidence/merge";
import { jaroWinkler, normalizeName, normalizeStreet, phoneDigits } from "../lib/referrals/evidence/normalize";
import { addressLine, nppesFacts } from "../lib/referrals/evidence/store";
import { MERGE_SET } from "./fixtures/referrals/merge-set";

const NOW = new Date("2026-10-29T12:00:00Z");
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
const fact = (over: Partial<Fact> & Pick<Fact, "field" | "value" | "origin">): Fact => ({ method: "npi", score: 1, checkedAt: at(1), ...over });

describe("normalize", () => {
  it("strips titles, credentials and handles Last, First", () => {
    expect(normalizeName("Dr. Maria L. Rivera-Lopez, MD, FAAP")).toMatchObject({ first: "maria", last: "riveralopez", lasts: ["riveralopez", "rivera", "lopez"] });
    expect(normalizeName("RIVERA, MARIA")).toMatchObject({ first: "maria", last: "rivera" });
    expect(normalizeName("José Núñez")).toMatchObject({ first: "jose", last: "nunez" });
  });
  it("puts streets in USPS short forms without the unit", () => {
    expect(normalizeStreet("2400 North Lincoln Avenue, Suite 210")).toBe("2400 n lincoln ave");
    expect(normalizeStreet("2400 N. LINCOLN AVE STE 210")).toBe("2400 n lincoln ave");
    expect(normalizeStreet("100 W Madison St #5")).toBe("100 w madison st");
  });
  it("reads US phones", () => {
    expect(phoneDigits("+1 (312) 555-0100")).toBe("3125550100");
    expect(phoneDigits("555-0100")).toBe("");
  });
  it("Jaro-Winkler matches the textbook values", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("dwayne", "duane")).toBeCloseTo(0.84, 2);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });
});

describe("matching on the labeled set", () => {
  const results = MERGE_SET.map((p) => ({ ...p, got: matchCandidate(p.a, p.b) !== null }));
  const tp = results.filter((r) => r.same && r.got).length;
  const fp = results.filter((r) => !r.same && r.got);
  const fn = results.filter((r) => r.same && !r.got);
  const precision = tp / (tp + fp.length);
  const recall = tp / (tp + fn.length);

  it("never merges two different providers (precision 1.0)", () => {
    expect(fp.map((r) => r.why)).toEqual([]);
    expect(precision).toBe(1);
  });
  it("finds most of the same provider (recall at least 0.85); the misses are nicknames and spelling variants", () => {
    expect(recall).toBeGreaterThanOrEqual(0.85);
    for (const miss of fn) expect(miss.why).toMatch(/nickname|spelling variant/);
  });
  it("says how it matched", () => {
    expect(matchCandidate({ npi: "1900000001" }, { npi: "1900000001" })).toEqual({ method: "npi", score: 1 });
    expect(matchCandidate({ name: "Avery Samplewood", city: "Chicago" }, { name: "SAMPLEWOOD, AVERY", city: "CHICAGO" })?.method).toBe("name_city");
    expect(matchCandidate({ name: "Maria Rivera", street: "2400 N Lincoln Ave", zip: "60614" }, { name: "Maria Rivera", street: "2400 North Lincoln Avenue", zip: "60614" })?.method).toBe("name_address");
  });
  it("a different last name never matches, however close the first", () => {
    expect(personNameScore("Maria Rivera", "Maria Romero")).toBe(0);
  });
  it("with both first names given they must be the same, or a known nickname", () => {
    expect(personNameScore("Avery Samplewood", "Augustine Samplewood")).toBe(0);
    expect(personNameScore("Maria Rivera", "Mario Rivera")).toBe(0); // close spelling, different person
    expect(personNameScore("Robert Szabo", "Bob Szabo")).toBeGreaterThan(0.92);
    expect(personNameScore("Rivera", "Mario Rivera")).toBeGreaterThan(0); // one side gives only a last name
  });
  it("an organization name needs whole words, not a prefix", () => {
    expect(orgNameScore("Northside Family Medicine", "Northside Family Medicine Associates")).toBe(0.95);
    expect(orgNameScore("Northside Fam", "Northside Family Medicine")).toBeLessThan(0.92);
    expect(orgNameScore("Lakeview Pediatrics", "Lakeview Pediatric Dentistry")).toBeLessThan(0.92);
    expect(orgNameScore("Lakeview Counseling Center", "Lakeview Counseling Centre")).toBeGreaterThanOrEqual(0.92);
  });
});

describe("merging facts", () => {
  it("a website phone beats the registry's (often a billing line) and the conflict is said plainly", () => {
    const view = mergeField("phone", [
      fact({ field: "phone", value: "312-555-0100", origin: "nppes" }),
      fact({ field: "phone", value: "(312) 555-0199", origin: "website", method: "name_address" }),
    ])!;
    expect(view.value).toBe("312-555-0199");
    expect(view.confidence).toBe("low");
    const ev = mergeEvidence([
      fact({ field: "phone", value: "312-555-0100", origin: "nppes" }),
      fact({ field: "phone", value: "(312) 555-0199", origin: "website", method: "name_address" }),
    ], { now: NOW });
    expect(ev.conflicts).toEqual(["Phone differs between sources: their website 312-555-0199 and NPI Registry 312-555-0100."]);
  });
  it("two independent sources agreeing make a field high; one alone is medium", () => {
    const one = [fact({ field: "address", value: "2400 N Lincoln Ave, Chicago, IL 60614", origin: "nppes" })];
    expect(mergeField("address", one)!.confidence).toBe("medium");
    const two = [...one, fact({ field: "address", value: "2400 North Lincoln Avenue, Suite 210, Chicago, IL 60614-3301", origin: "cms_dac" })];
    const view = mergeField("address", two)!;
    expect(view.confidence).toBe("high");
    expect(view.origins).toEqual(["nppes", "cms_dac"]);
    expect(view.others).toEqual([]);
  });
  it("what she typed wins and is high", () => {
    const view = mergeField("email", [
      fact({ field: "email", value: "frontdesk@example.com", origin: "website" }),
      fact({ field: "email", value: "dr.rivera@example.com", origin: "clinician", method: "manual" }),
    ])!;
    expect(view).toMatchObject({ value: "dr.rivera@example.com", confidence: "high" });
  });
  it("an email marked unconfirmed stays low", () => {
    expect(mergeField("email", [fact({ field: "email", value: "info@example.com", origin: "website", detail: { unconfirmed: true } })])!.confidence).toBe("low");
  });
  it("keys addresses by street and ZIP, ignoring the suite and ZIP+4", () => {
    expect(valueKey("address", "2400 N Lincoln Ave, Suite 210, Chicago, IL 60614-3301")).toBe(valueKey("address", "2400 North Lincoln Avenue, Chicago, IL 60614"));
  });
});

describe("card confidence and the Confirmed by line", () => {
  const nppes = (days = 1) => nppesFacts(
    { npi: "1900000001", name: "Maria Rivera, MD", organization: null, practiceName: null, npiType: "individual", credential: "MD", taxonomy: "207Q00000X", taxonomyLabel: "Family Medicine", specialty: "family_medicine", specialtyLabel: "Family medicine", address: "2400 N Lincoln Ave, Suite 210", city: "Chicago", state: "IL", zip: "60614", phone: "312-555-0100", homeAddress: false, fax: null, official: null, lastUpdated: "2025-01-01" },
    at(days),
  );
  it("NPI Registry alone is partly confirmed", () => {
    const ev = mergeEvidence(nppes(), { now: NOW });
    expect(ev).toMatchObject({ confidence: "partly", confirmedBy: ["NPI Registry"], conflicts: [], stale: false });
  });
  it("registry plus Medicare plus an active license is confirmed, named in order", () => {
    const ev = mergeEvidence([
      ...nppes(),
      fact({ field: "address", value: "2400 N Lincoln Ave, Chicago, IL 60614", origin: "cms_dac" }),
      fact({ field: "medicare", value: "enrolled", origin: "cms_dac" }),
      fact({ field: "license_status", value: "ACTIVE", origin: "state_license", method: "name_city", score: 0.9 }),
    ], { now: NOW });
    expect(ev.confidence).toBe("confirmed");
    expect(ev.confirmedBy).toEqual(["NPI Registry", "Medicare file", "State license: active"]);
  });
  it("a name-and-city match (the license list) never lifts a card to confirmed on its own", () => {
    const ev = mergeEvidence([...nppes(), fact({ field: "license_status", value: "ACTIVE", origin: "state_license", method: "name_city", score: 0.9 })], { now: NOW });
    expect(ev.confidence).toBe("partly");
    expect(ev.confirmedBy).toContain("State license: active"); // still shown, just not counted
  });
  it("a license that isn't active, or an NPI gone from the registry, is not confirmed and flagged", () => {
    const lapsed = mergeEvidence([...nppes(), fact({ field: "license_status", value: "NOT RENEWED", origin: "state_license", method: "name_city" })], { now: NOW });
    expect(lapsed.confidence).toBe("unconfirmed");
    expect(lapsed.flags[0]).toMatch(/not renewed/);
    const gone = mergeEvidence([fact({ field: "npi_status", value: "not_found", origin: "nppes" })], { now: NOW });
    expect(gone.confidence).toBe("unconfirmed");
    expect(gone.flags[0]).toMatch(/Not in the NPI Registry/);
    expect(gone.confirmedBy).toEqual([]);
  });
  it("a name conflict keeps it at partly", () => {
    const ev = mergeEvidence([...nppes(), fact({ field: "name", value: "Marisol Rivera", origin: "osm", method: "name_address" })], { now: NOW });
    expect(ev.confidence).toBe("partly");
    expect(ev.conflicts[0]).toMatch(/^Name differs/);
  });
  it("is stale after 30 days, and you count as a source but not toward the date", () => {
    expect(mergeEvidence(nppes(31), { now: NOW }).stale).toBe(true);
    const ev = mergeEvidence([...nppes(10), fact({ field: "email", value: "a@example.com", origin: "clinician", method: "manual", checkedAt: at(0) })], { now: NOW });
    expect(ev.checkedAt).toBe(at(10));
    expect(ev.confirmedBy).toEqual(["NPI Registry", "You"]);
  });
  it("addressLine joins the parts", () => {
    expect(addressLine("2400 N Lincoln Ave", "Chicago", "IL", "60614")).toBe("2400 N Lincoln Ave, Chicago, IL 60614");
  });
});
