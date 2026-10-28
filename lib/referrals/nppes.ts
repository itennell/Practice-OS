// The free federal NPI Registry (NPPES API v2.1, no key). We search it by the
// words NPPES uses for each specialty, then keep only providers whose PRIMARY
// NUCC taxonomy code is one we want: NPPES also matches secondary taxonomies,
// so a "Family Medicine" search returns, say, a wound-care nursing group.
// Codes: NUCC Health Care Provider Taxonomy code set (nucc.org).

export const NPPES_URL = "https://npiregistry.cms.hhs.gov/api/";

export type SpecialtyId = "family_medicine" | "internal_medicine" | "ob_gyn" | "pediatrics" | "oncology" | "therapists";

type Specialty = {
  id: SpecialtyId;
  label: string;
  /** taxonomy_description values sent to NPPES. */
  searches: string[];
  /** A primary code that matches one of these (exactly, or by prefix ending in "*") counts. */
  codes: string[];
};

export const SPECIALTIES: Specialty[] = [
  { id: "family_medicine", label: "Family medicine", searches: ["Family Medicine"], codes: ["207Q*"] },
  { id: "internal_medicine", label: "Internal medicine", searches: ["Internal Medicine"], codes: ["207R00000X"] },
  { id: "ob_gyn", label: "OB/GYN", searches: ["Obstetrics & Gynecology"], codes: ["207V00000X", "207VG0400X", "207VX0000X"] },
  { id: "pediatrics", label: "Pediatrics", searches: ["Pediatrics"], codes: ["208000000X", "2080A0000X"] },
  {
    id: "oncology",
    label: "Oncology",
    searches: ["Hematology & Oncology", "Medical Oncology", "Radiation Oncology", "Gynecologic Oncology"],
    codes: ["207RH0003X", "207RX0202X", "2085R0001X", "207VX0201X"],
  },
  {
    id: "therapists",
    label: "Therapist",
    searches: ["Clinical Social Worker", "Psychologist", "Marriage & Family Therapist", "Counselor"],
    codes: ["1041C0700X", "103T*", "106H00000X", "101YP2500X", "101YM0800X"],
  },
];

export const SPECIALTY_BY_ID = new Map(SPECIALTIES.map((s) => [s.id, s]));

/** NUCC codes are 10 characters: 9 letters or digits, then X. */
export const TAXONOMY_CODE = /^[0-9]{3}[0-9A-Z]{6}X$/;

export function specialtyForCode(code: string): Specialty | null {
  return (
    SPECIALTIES.find((s) => s.codes.some((c) => (c.endsWith("*") ? code.startsWith(c.slice(0, -1)) : code === c))) ?? null
  );
}

// ---- the raw NPPES shape (only the fields we read) ---------------------------

type NppesAddress = {
  address_1?: string;
  address_2?: string;
  address_purpose?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
};
type NppesTaxonomy = { code: string; desc?: string; primary?: boolean };
export type NppesResult = {
  number: string | number;
  enumeration_type: "NPI-1" | "NPI-2";
  basic: {
    status?: string;
    first_name?: string;
    last_name?: string;
    credential?: string;
    organization_name?: string;
    last_updated?: string;
  };
  addresses?: NppesAddress[];
  taxonomies?: NppesTaxonomy[];
};
export type NppesResponse = { result_count?: number; results?: NppesResult[]; Errors?: { description: string }[] };

/** One provider, ready for referral_sources. */
export type Provider = {
  npi: string;
  name: string;
  organization: string | null;
  npiType: "individual" | "organization";
  credential: string | null;
  taxonomy: string;
  specialty: SpecialtyId;
  specialtyLabel: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  lastUpdated: string | null;
};

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function cleanCredential(raw: string | undefined): string | null {
  const c = (raw ?? "").replace(/\./g, "").replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "").toUpperCase();
  return c ? c.slice(0, 40) : null;
}

function formatPhone(raw: string | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : null;
}

/** One NPPES result to a Provider, or null when it isn't active or its primary specialty isn't one we want. */
export function parseResult(r: NppesResult, want?: Set<SpecialtyId>): Provider | null {
  const npi = String(r.number);
  if (!/^[0-9]{10}$/.test(npi)) return null;
  if (r.basic?.status && r.basic.status !== "A") return null;
  const primary = (r.taxonomies ?? []).find((t) => t.primary);
  if (!primary || !TAXONOMY_CODE.test(primary.code)) return null;
  const spec = specialtyForCode(primary.code);
  if (!spec || (want && !want.has(spec.id))) return null;

  const addresses = r.addresses ?? [];
  const loc = addresses.find((a) => a.address_purpose === "LOCATION") ?? addresses[0];
  if (!loc?.postal_code) return null;

  const individual = r.enumeration_type === "NPI-1";
  const credential = individual ? cleanCredential(r.basic.credential) : null;
  const person = [r.basic.first_name, r.basic.last_name].filter(Boolean).map((p) => titleCase(p!)).join(" ");
  const org = r.basic.organization_name ? titleCase(r.basic.organization_name) : null;
  const name = individual ? (credential ? `${person}, ${credential}` : person) : org;
  if (!name) return null;

  return {
    npi,
    name,
    organization: individual ? null : org,
    npiType: individual ? "individual" : "organization",
    credential,
    taxonomy: primary.code,
    specialty: spec.id,
    specialtyLabel: spec.label,
    address: titleCase([loc.address_1, loc.address_2].filter(Boolean).join(", ")),
    city: titleCase(loc.city ?? ""),
    state: (loc.state ?? "").toUpperCase(),
    zip: loc.postal_code.slice(0, 5),
    phone: formatPhone(loc.telephone_number),
    lastUpdated: r.basic.last_updated ?? null,
  };
}

/** All results of several NPPES replies, parsed, without duplicates (same NPI, or same name at the same address). */
export function parseResponses(responses: NppesResponse[], want?: Set<SpecialtyId>): Provider[] {
  const byNpi = new Map<string, Provider>();
  const seen = new Set<string>();
  for (const res of responses) {
    for (const r of res.results ?? []) {
      const p = parseResult(r, want);
      if (!p || byNpi.has(p.npi)) continue;
      const key = `${p.name.toLowerCase()}|${p.address.toLowerCase()}|${p.zip}`;
      if (seen.has(key)) continue;
      seen.add(key);
      byNpi.set(p.npi, p);
    }
  }
  return [...byNpi.values()];
}

export function searchUrl(description: string, zip: string, skip = 0): string {
  const params = new URLSearchParams({
    version: "2.1",
    taxonomy_description: description,
    postal_code: zip,
    limit: "200",
    skip: String(skip),
  });
  return `${NPPES_URL}?${params}`;
}

type Fetcher = (url: string) => Promise<NppesResponse>;

const defaultFetch: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`The NPI Registry answered ${res.status}.`);
  return (await res.json()) as NppesResponse;
};

/** Every search for these specialties in these ZIPs, 200 at a time (NPPES stops at skip 1000). */
export async function fetchProviders(
  specialties: SpecialtyId[],
  zips: string[],
  fetcher: Fetcher = defaultFetch,
): Promise<Provider[]> {
  const jobs = specialties.flatMap((id) => SPECIALTY_BY_ID.get(id)!.searches).flatMap((d) => zips.map((z) => [d, z] as const));
  const responses: NppesResponse[] = [];
  const queue = [...jobs];
  async function worker() {
    for (let job = queue.shift(); job; job = queue.shift()) {
      for (let skip = 0; skip <= 1000; skip += 200) {
        const res = await fetcher(searchUrl(job[0], job[1], skip));
        if (res.Errors?.length) break;
        responses.push(res);
        if ((res.results?.length ?? 0) < 200) break;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker));
  return parseResponses(responses, new Set(specialties));
}
