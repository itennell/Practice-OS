// The referral source catalog (docs/research/referral-sources.json): its shape,
// the NPPES codes and searches checked live on 2026-11-02, the niche presets,
// sensitive types, and that the seven original specialties didn't move.
// No network: the verification lives in the file itself.
import { describe, expect, it, vi } from "vitest";
import research from "../docs/research/referral-sources.json" with { type: "json" };
import {
  CATALOG,
  CATEGORIES,
  categoryOf,
  catalogPoints,
  FOCUS_IDS,
  isSensitive,
  isSessionCapped,
  JUDGMENT_POINTS_MAX,
  NICHE_PRESETS,
  POINTS_MAX,
  readCatalog,
  SESSION_CAPPED_BOOST,
  SOURCE_TYPE_BY_ID,
  SOURCE_TYPES,
  specialtiesFor,
  typeForCode,
  typesForNiche,
} from "../lib/referrals/catalog";
import { CATEGORY_LABELS, groupByCategory, SPECIALTY_CATEGORY } from "../lib/referrals/categories";
import { ORIGINAL_SPECIALTY_IDS, SPECIALTIES, SPECIALTY_BY_ID, specialtyForCode, TAXONOMY_CODE } from "../lib/referrals/nppes";
import { FOCUS_WORDS, isMismatch, pointsForSpecialty, SPECIALTY_POINTS, tierFor, whyTheyRefer } from "../lib/referrals/tier";

const clone = () => JSON.parse(JSON.stringify(research));

describe("catalog file", () => {
  it("parses, with 13 categories and every type in one of them", () => {
    expect(CATALOG).not.toBeNull();
    expect(CATALOG!.version).toBe("1.0");
    expect(CATALOG!.status).toMatch(/judgment/);
    expect(CATEGORIES.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    for (const c of CATEGORIES) expect(SOURCE_TYPES.some((t) => t.category === c.id), `category ${c.id} is empty`).toBe(true);
    expect(SOURCE_TYPES.length).toBeGreaterThan(80);
  });

  it("refuses a broken file, saying what is wrong", () => {
    const bad = clone();
    bad.types[0].category = 14;
    expect(() => readCatalog(bad)).toThrow(/category/);
    const dup = clone();
    dup.types.push(dup.types[0]);
    expect(() => readCatalog(dup)).toThrow(/duplicate type/);
    const noCodes = clone();
    delete noCodes.types.find((t: { findable_via: string }) => t.findable_via === "nppes").nucc_codes;
    expect(() => readCatalog(noCodes)).toThrow(/needs nucc_codes/);
    const codesOnManual = clone();
    codesOnManual.types.find((t: { findable_via: string }) => t.findable_via === "manual").nucc_codes = ["207Q00000X"];
    expect(() => readCatalog(codesOnManual)).toThrow(/only for NPPES/);
  });

  it("every type has a talk track and a reason, and no talk track offers anything for a referral", () => {
    for (const t of SOURCE_TYPES) {
      expect(t.why_they_refer.length).toBeGreaterThan(10);
      expect(t.talk_track.they_need.length).toBeGreaterThan(10);
      expect(t.talk_track.you_offer.length).toBeGreaterThan(10);
      expect(`${t.talk_track.they_need} ${t.talk_track.you_offer}`).not.toMatch(/\b(gift|commission|kickback|per referral|referral fee|discount|gift card)\b/i);
      // Anything offered for free (a talk, a workshop) says it is never tied to referrals.
      if (/\b(free|talk|workshop)\b/i.test(t.talk_track.you_offer)) expect(t.talk_track.you_offer, t.id).toMatch(/never tied to referrals/);
    }
  });

  it("the urgent care talk track names 988 for a crisis and 911 for emergencies", () => {
    expect(SOURCE_TYPE_BY_ID.get("urgent_care")!.talk_track.you_offer).toMatch(/988 for a mental health crisis, 911 for emergencies/);
  });

  it("no unsourced absolutes in the public reasons", () => {
    for (const t of SOURCE_TYPES) expect(t.why_they_refer, t.id).not.toMatch(/fastest-growing|constantly|first-line|3 to 8/i);
    // A reason backed by a source names its URL.
    expect(SOURCE_TYPE_BY_ID.get("transplant_programs")!.why_basis).toMatch(/482\.90/);
    expect(SOURCE_TYPE_BY_ID.get("hospice")!.why_basis).toMatch(/418\.64/);
  });

  it("points: the originals keep their research points; every other type is judgment, 20 at most", () => {
    const original = new Set<string>(ORIGINAL_SPECIALTY_IDS);
    for (const t of SOURCE_TYPES) {
      expect(t.points_basis, t.id).toBe(original.has(t.id) ? "research" : "judgment");
      if (!original.has(t.id)) expect(t.default_points, t.id).toBeLessThanOrEqual(JUDGMENT_POINTS_MAX);
    }
    const bad = clone();
    bad.types.find((t: { id: string }) => t.id === "hospice").default_points = 30;
    expect(() => readCatalog(bad)).toThrow(/judgment points are at most 20/);
  });
});

describe("NPPES types", () => {
  const nppesTypes = SOURCE_TYPES.filter((t) => [t.findable_via, ...(t.also_findable_via ?? [])].includes("nppes"));

  it("each has NUCC codes (or shares another type's), a verified Illinois search and specialties that exist", () => {
    expect(nppesTypes.length).toBeGreaterThan(30);
    for (const t of nppesTypes) {
      if (t.shared_with) expect(SOURCE_TYPE_BY_ID.get(t.shared_with)!.nucc_codes!.length, t.id).toBeGreaterThan(0);
      else expect(t.nucc_codes!.length, t.id).toBeGreaterThan(0);
      for (const c of t.nucc_codes ?? []) expect(TAXONOMY_CODE.test(c), `${t.id} ${c}`).toBe(true);
      for (const s of t.nppes_searches!) {
        const v = CATALOG!.nppes_verification[s];
        expect(v, `${t.id}: "${s}"`).toBeDefined();
        expect(v.il_results).toBeGreaterThan(0);
        expect(v.checked).toMatch(/^2026-/);
      }
      // Every kept code came back on one of the type's own searches.
      for (const c of t.nucc_codes ?? []) expect(t.nppes_searches!.some((s) => CATALOG!.nppes_verification[s].codes_returned.includes(c)), `${t.id} ${c}`).toBe(true);
      expect(specialtiesFor(t.id).length, t.id).toBe(t.nppes_specialties!.length);
    }
    expect(SOURCE_TYPE_BY_ID.get("group_practices")!.shared_with).toBe("therapists");
  });

  it("each code is found by one of the type's specialties, and belongs to exactly one type", () => {
    const seen = new Map<string, string>();
    for (const t of nppesTypes) {
      for (const c of t.nucc_codes ?? []) {
        expect(t.nppes_specialties, `${t.id} ${c}`).toContain(specialtyForCode(c)?.id);
        expect(seen.get(c), `${c} in ${t.id} and ${seen.get(c)}`).toBeUndefined();
        seen.set(c, t.id);
        expect(typeForCode(c)!.id).toBe(t.id);
      }
    }
    const dup = clone();
    dup.types.find((t: { id: string }) => t.id === "pmhnp").nucc_codes.push("2084P0800X");
    expect(() => readCatalog(dup)).toThrow(/already psychiatry's/);
  });

  it("dermatology lists exact codes and leaves out the laboratory ones", () => {
    expect(SPECIALTY_BY_ID.get("dermatology")!.codes.every((c) => !c.endsWith("*"))).toBe(true);
    expect(specialtyForCode("207ND0900X")).toBeNull(); // dermatopathology
    expect(specialtyForCode("207NI0002X")).toBeNull();
    expect(specialtyForCode("207N00000X")?.id).toBe("dermatology");
  });

  it("verifies only searches a type uses", () => {
    expect(CATALOG!.nppes_verification["Hospice"]).toBeUndefined();
    expect(CATALOG!.nppes_verification["Dietitian"]).toBeUndefined();
    const bad = clone();
    bad.nppes_verification.Hospice = { il_results: 5, of: 5, limit: 200, checked: "2026-11-02", codes_returned: [] };
    expect(() => readCatalog(bad)).toThrow(/"Hospice" is not used/);
  });

  it("every SPECIALTIES search was verified live, and every specialty is a catalog type", () => {
    for (const s of SPECIALTIES) {
      for (const q of s.searches) expect(CATALOG!.nppes_verification[q], `${s.id}: "${q}"`).toBeDefined();
      expect(SOURCE_TYPE_BY_ID.has(s.id), s.id).toBe(true);
    }
  });

  it("refuses the descriptions NPPES refuses", () => {
    expect(CATALOG!.nppes_verification["Clinical Social Worker"]).toBeUndefined();
    expect(CATALOG!.nppes_verification["Chaplain"]).toBeUndefined();
    expect(SOURCE_TYPE_BY_ID.get("chaplains")!.findable_via).toBe("manual");
    expect(SOURCE_TYPE_BY_ID.get("bariatric_surgery")!.findable_via).not.toBe("nppes");
  });
});

describe("the seven original specialties", () => {
  it("keep their ids, searches and codes", () => {
    expect(SPECIALTIES.slice(0, 7).map((s) => s.id)).toEqual([...ORIGINAL_SPECIALTY_IDS]);
    expect(SPECIALTY_BY_ID.get("therapists")!.searches).toEqual(["Social Worker", "Psychologist", "Marriage & Family Therapist", "Counselor"]);
    expect(SPECIALTY_BY_ID.get("family_medicine")!.codes).toEqual(["207Q*", "363LF0000X"]);
    expect(SPECIALTY_BY_ID.get("psychiatry")!.codes).toEqual(["2084P08*", "363LP0808X"]);
  });

  it("no new specialty takes a code from them", () => {
    const original = new Set<string>(ORIGINAL_SPECIALTY_IDS);
    for (const s of SPECIALTIES.filter((x) => !original.has(x.id))) {
      for (const c of s.codes.filter((x) => !x.endsWith("*"))) expect(specialtyForCode(c)?.id, `${s.id} ${c}`).toBe(s.id);
    }
    // Codes inside the original prefixes still belong to them.
    for (const [code, id] of [
      ["207QG0300X", "family_medicine"],
      ["207RG0300X", "internal_medicine"],
      ["207VE0102X", "ob_gyn"],
      ["2084P0804X", "psychiatry"],
      ["103TC0700X", "therapists"],
      ["207VX0201X", "oncology"],
    ]) expect(specialtyForCode(code)?.id).toBe(id);
  });

  it("keep their tier points; new kinds score with the catalog's default points, never above the therapists'", () => {
    expect(SPECIALTY_POINTS).toMatchObject({ family_medicine: 35, pediatrics: 33, ob_gyn: 32, psychiatry: 30, internal_medicine: 30, oncology: 22, therapists: 20 });
    for (const id of ORIGINAL_SPECIALTY_IDS) expect(catalogPoints(id)).toBe(SPECIALTY_POINTS[id]);
    expect(pointsForSpecialty("hospice")).toBe(SOURCE_TYPE_BY_ID.get("hospice")!.default_points);
    const original = new Set<string>(ORIGINAL_SPECIALTY_IDS);
    for (const s of SPECIALTIES.filter((x) => !original.has(x.id))) expect(pointsForSpecialty(s.id), s.id).toBeLessThanOrEqual(SPECIALTY_POINTS.therapists!);
  });
});

describe("who each kind sees", () => {
  it("every NPI Registry kind has a 'sees' (tier.ts for the originals, the catalog for the rest)", () => {
    for (const s of SPECIALTIES) {
      const sees = SOURCE_TYPE_BY_ID.get(s.id)!.sees;
      expect(sees, s.id).toBeDefined();
      if (sees !== "all") for (const f of sees!) expect(Object.keys(FOCUS_WORDS)).toContain(f);
    }
    expect([...FOCUS_IDS].sort()).toEqual(Object.keys(FOCUS_WORDS).sort());
  });

  it("a hospice matches an adults practice and is Later for a children-only one", () => {
    const hospice = { taxonomy: "251G00000X", npiType: "organization" as const, official: "Ann Lee", phone: "312-555-0100", state: "IL" };
    const adults = tierFor(hospice, { miles: 0.2, focus: ["adults"], clinicianState: "IL" });
    expect(adults.specialty).toBe("hospice");
    expect(adults.reasons).toContain("matches your adults focus");
    expect(adults.reasons[0]).toBe(whyTheyRefer("251G00000X", "hospice"));
    const kids = tierFor(hospice, { miles: 0.2, focus: ["children"], clinicianState: "IL" });
    expect(kids.tier).toBe("later");
    expect(isMismatch(kids.reasons)).toBe(true);
    // A doula, for a children-only practice, too.
    expect(tierFor({ taxonomy: "374J00000X", npiType: "individual", phone: "312-555-0101", fax: "312-555-0102", state: "IL" }, { miles: 0, focus: ["children"], clinicianState: "IL" }).tier).toBe("later");
  });

  it("fails closed: a kind with no 'sees' is Later when she has a focus", async () => {
    vi.resetModules();
    vi.doMock("../lib/referrals/catalog", async (orig) => ({ ...(await orig<typeof import("../lib/referrals/catalog")>()), catalogSees: () => null }));
    const tier = await import("../lib/referrals/tier");
    const r = tier.tierFor({ taxonomy: "374J00000X", npiType: "individual", phone: "312-555-0101", fax: "312-555-0102", state: "IL" }, { miles: 0, focus: ["perinatal"], clinicianState: "IL" });
    expect(r.tier).toBe("later");
    expect(r.reasons).toContain(tier.UNKNOWN_SEES_REASON);
    // With no focus there is nothing to match, so it ranks on points alone.
    expect(tier.tierFor({ taxonomy: "374J00000X", npiType: "individual" }, { miles: 0, focus: [] }).reasons).not.toContain(tier.UNKNOWN_SEES_REASON);
    vi.doUnmock("../lib/referrals/catalog");
    vi.resetModules();
  });

  it("the first reason is the catalog's why_they_refer, not a generic line", () => {
    const r = tierFor({ taxonomy: "207QG0300X", npiType: "individual" }, { miles: 1, focus: [] });
    expect(r.specialty).toBe("family_medicine"); // the code stays with family medicine…
    expect(r.reasons[0]).toBe(whyTheyRefer("207QG0300X", "family_medicine")); // …and the reason is geriatrics'
    expect(r.reasons[0]).toMatch(/^grief, adjustment to aging/);
    for (const s of SPECIALTIES) expect(whyTheyRefer(null, s.id), s.id).not.toMatch(/talk therapy and often have no one/);
  });
});

describe("categories for the area explorer", () => {
  it("match the catalog", () => {
    for (const c of CATEGORIES) expect(CATEGORY_LABELS[c.id]).toBe(c.label);
    for (const s of SPECIALTIES) expect(SPECIALTY_CATEGORY[s.id], s.id).toBe(categoryOf(s.id));
    const groups = groupByCategory(SPECIALTIES);
    expect(groups.map((g) => g.category)).toEqual([...groups.map((g) => g.category)].sort((a, b) => a - b));
    expect(groups.flatMap((g) => g.items).length).toBe(SPECIALTIES.length);
  });

  it("chip labels fit a 390px phone", () => {
    for (const s of SPECIALTIES) expect(s.label.length, s.label).toBeLessThanOrEqual(34);
  });
});

describe("niche presets", () => {
  it("has the 11 presets from the brief, labelled as judgment", () => {
    expect(CATALOG!.niche_presets.judgment).toBe(true);
    expect(NICHE_PRESETS.map((p) => p.id)).toEqual([
      "oncology_serious_illness",
      "grief_loss",
      "perinatal_reproductive",
      "children_teens_families",
      "college_young_adults",
      "couples",
      "trauma",
      "chronic_illness_pain",
      "eating_disorders",
      "older_adults_caregivers",
      "general_adult",
    ]);
  });

  it("reference only real categories and types", () => {
    const cats = new Set(CATEGORIES.map((c) => String(c.id)));
    for (const p of NICHE_PRESETS) {
      for (const k of Object.keys(p.category_weights)) expect(cats.has(k), `${p.id} category ${k}`).toBe(true);
      for (const k of Object.keys(p.type_boosts)) expect(SOURCE_TYPE_BY_ID.has(k), `${p.id} type ${k}`).toBe(true);
    }
    const ids = new Set(NICHE_PRESETS.map((p) => p.id));
    for (const t of SOURCE_TYPES) for (const n of t.niches) expect(ids.has(n), `${t.id} niche ${n}`).toBe(true);
    const bad = clone();
    bad.niche_presets.presets[0].type_boosts.not_a_type = 1.5;
    expect(() => readCatalog(bad)).toThrow(/unknown type not_a_type/);
  });

  it("the oncology preset puts serious-illness partners first and includes funeral homes, clergy and genetic counselors", () => {
    const list = typesForNiche("oncology_serious_illness").map((x) => x.type.id);
    for (const id of ["oncology", "palliative_care", "hospice", "funeral_homes", "clergy", "genetic_counselors", "home_health", "disease_orgs"]) expect(list).toContain(id);
    expect(list.slice(0, 5)).toContain("oncology");
    expect(list).not.toContain("school_staff");
    expect(typesForNiche("no_such_preset")).toEqual([]);
  });

  it("niche-weighted points stay on the 0-35 scale", () => {
    for (const p of NICHE_PRESETS) {
      for (const x of typesForNiche(p.id)) {
        expect(x.points, `${p.id} ${x.type.id}`).toBeLessThanOrEqual(POINTS_MAX);
        expect(x.points).toBeGreaterThanOrEqual(0);
      }
    }
    // Oncology 22 x 1.5 x 1.5 would be 49.5 unclamped.
    expect(typesForNiche("oncology_serious_illness").find((x) => x.type.id === "oncology")!.points).toBe(35);
  });

  it("the session-capped boost is set, and EAPs, college counseling and hospice are capped", () => {
    expect(CATALOG!.session_capped_boost.judgment).toBe(true);
    expect(SESSION_CAPPED_BOOST).toBeGreaterThan(0);
    for (const id of ["eap", "college_counseling", "hospice"]) expect(isSessionCapped(id), id).toBe(true);
    expect(isSessionCapped("family_medicine")).toBe(false);
  });
});

describe("helpers", () => {
  it("categoryOf and isSensitive", () => {
    expect(categoryOf("hospice")).toBe(5);
    expect(categoryOf("funeral_homes")).toBe(12);
    expect(categoryOf("nope")).toBeNull();
    expect(isSensitive("dv_sa_agencies")).toBe(true);
    expect(isSensitive("family_medicine")).toBe(false);
    expect(isSensitive("nope")).toBe(false);
    expect(isSensitive("shelters")).toBe(true);
    // Only DV/SA agencies and shelters are sensitive, and they never come from a map dataset.
    const sensitive = SOURCE_TYPES.filter((t) => t.sensitive);
    expect(sensitive.map((t) => t.id)).toEqual(["dv_sa_agencies", "shelters"]);
    for (const t of sensitive) {
      expect(["osm_tags", "nppes", "cms_dataset"]).not.toContain(t.findable_via);
      expect(t.note).toMatch(/street address/);
    }
  });
});
