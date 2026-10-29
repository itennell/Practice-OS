// The free federal NPI Registry (NPPES API v2.1, no key). We search it by the
// words NPPES uses for each specialty, then keep only providers whose PRIMARY
// NUCC taxonomy code is one we want: NPPES also matches secondary taxonomies,
// so a "Family Medicine" search returns, say, a wound-care nursing group.
// Codes: NUCC Health Care Provider Taxonomy code set (nucc.org).

export const NPPES_URL = "https://npiregistry.cms.hhs.gov/api/";

export type SpecialtyId =
  | "family_medicine"
  | "internal_medicine"
  | "ob_gyn"
  | "pediatrics"
  | "psychiatry"
  | "oncology"
  | "therapists";

type Specialty = {
  id: SpecialtyId;
  label: string;
  /** taxonomy_description values sent to NPPES (checked live 2026-10-29: "Clinical Social Worker" is refused, "Social Worker" works). */
  searches: string[];
  /** A primary code that matches one of these (exactly, or by prefix ending in "*") counts. Exact codes win over prefixes. */
  codes: string[];
};

// Nurse practitioners in the same field count too: a "Pediatrics" search
// returns pediatric NPs (363LP0200X) and subspecialists (2080P0204X) as well.
export const SPECIALTIES: Specialty[] = [
  { id: "family_medicine", label: "Family medicine", searches: ["Family Medicine"], codes: ["207Q*", "363LF0000X"] },
  { id: "internal_medicine", label: "Internal medicine", searches: ["Internal Medicine"], codes: ["207R00000X", "207RG0300X"] },
  { id: "ob_gyn", label: "OB/GYN", searches: ["Obstetrics & Gynecology"], codes: ["207V*", "363LX0001X"] },
  { id: "pediatrics", label: "Pediatrics", searches: ["Pediatrics"], codes: ["2080*", "363LP0200X"] },
  { id: "psychiatry", label: "Psychiatry", searches: ["Psychiatry"], codes: ["2084P08*", "363LP0808X"] },
  {
    id: "oncology",
    label: "Oncology",
    searches: ["Hematology & Oncology", "Medical Oncology", "Radiation Oncology", "Gynecologic Oncology"],
    codes: ["207RH0003X", "207RX0202X", "2085R0001X", "207VX0201X"],
  },
  {
    id: "therapists",
    label: "Therapist",
    searches: ["Social Worker", "Psychologist", "Marriage & Family Therapist", "Counselor"],
    codes: ["1041C0700X", "103T*", "106H00000X", "101YP2500X", "101YM0800X"],
  },
];

export const SPECIALTY_BY_ID = new Map(SPECIALTIES.map((s) => [s.id, s]));

/** NUCC codes are 10 characters: 9 letters or digits, then X. */
export const TAXONOMY_CODE = /^[0-9]{3}[0-9A-Z]{6}X$/;

export function specialtyForCode(code: string): Specialty | null {
  return (
    SPECIALTIES.find((s) => s.codes.includes(code)) ??
    SPECIALTIES.find((s) => s.codes.some((c) => c.endsWith("*") && code.startsWith(c.slice(0, -1)))) ??
    null
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
  fax_number?: string;
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
    authorized_official_first_name?: string;
    authorized_official_last_name?: string;
    authorized_official_title_or_position?: string;
  };
  addresses?: NppesAddress[];
  /** Extra practice locations a provider listed (not the main LOCATION address). */
  practiceLocations?: NppesAddress[];
  taxonomies?: NppesTaxonomy[];
  /** "Doing Business As" and former names; type code "3" is the DBA a group puts on its sign. */
  other_names?: { organization_name?: string; type?: string; code?: string }[];
};
export type NppesResponse = { result_count?: number; results?: NppesResult[]; Errors?: { description: string }[] };

/** One provider, ready for referral_sources. */
export type Provider = {
  npi: string;
  name: string;
  organization: string | null;
  /** The name on the door: a group's "Doing Business As" name, else its legal name. Null for a person (NPPES lists no employer). */
  practiceName: string | null;
  npiType: "individual" | "organization";
  credential: string | null;
  taxonomy: string;
  /** NPPES's own words for the primary taxonomy, e.g. "Social Worker, Clinical". */
  taxonomyLabel: string;
  specialty: SpecialtyId;
  specialtyLabel: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  /**
   * The practice location looks like a home (Apt, Unit, # with no group name):
   * many solo clinicians list where they live. The app then shows no street
   * line and pins it at the ZIP center.
   */
  homeAddress: boolean;
  /** Fax at the practice location: medical offices still send referrals by fax. */
  fax: string | null;
  /** For a group: the person NPPES lists as its authorized official, so a letter can name someone. */
  official: string | null;
  lastUpdated: string | null;
};

const KEEP_UPPER = new Set(["LLC", "PLLC", "PC", "SC", "LTD", "LLP", "PA", "MD", "DO", "II", "III", "IV", "USA", "UIC", "OB", "GYN", "NW", "NE", "SW", "SE"]);

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b[A-Za-z]+\b/g, (w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w));
}

function cleanCredential(raw: string | undefined): string | null {
  const c = (raw ?? "").replace(/\./g, "").replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "").toUpperCase();
  return c ? c.slice(0, 40) : null;
}

function formatPhone(raw: string | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : null;
}

// USPS Publication 28, Appendix C2 (secondary unit designators). These mark a
// dwelling: APT, UNIT, PH (penthouse), TRLR, and a bare "#", followed by a unit
// that has a digit or is one or two letters ("Apt 1502", "Unit B"), so street
// names like "Unity Ave" don't count. Office ones (STE, FL, RM, OFC, BLDG,
// DEPT) don't mark a home.
const RESIDENTIAL_UNIT = /(?:^|[\s,])(?:(?:APT|APARTMENT|UNIT|PH|PENTHOUSE|TRLR|TRAILER)\.?\s*#?|#)\s*(?=[\w-]*\d|[A-Z]{1,2}\b)[\w-]+/i;

/** True when a street line carries a home unit marker (Apt 1502, Unit B, #12) and no office one. */
export function looksResidential(line1?: string | null, line2?: string | null): boolean {
  const s = [line1, line2].filter(Boolean).join(", ");
  if (/\b(?:STE|SUITE|FL|FLOOR|RM|ROOM|OFC|OFFICE|BLDG|DEPT)\b/i.test(s)) return false;
  return RESIDENTIAL_UNIT.test(s);
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

  // Only where they see people: the LOCATION address, never the MAILING one
  // (often billing or home). A LOCATION that looks like a home gives way to an
  // extra practice location that doesn't.
  const individual = r.enumeration_type === "NPI-1";
  const main = (r.addresses ?? []).find((a) => a.address_purpose === "LOCATION");
  const hasGroupName = !individual && Boolean(r.basic.organization_name);
  const homeLike = (a: NppesAddress) => !hasGroupName && looksResidential(a.address_1, a.address_2);
  const office = (r.practiceLocations ?? []).find((a) => a.postal_code && !homeLike(a));
  const loc = main && !homeLike(main) ? main : (office ?? main);
  if (!loc?.postal_code) return null;

  const credential = individual ? cleanCredential(r.basic.credential) : null;
  const person = [r.basic.first_name, r.basic.last_name].filter(Boolean).map((p) => titleCase(p!)).join(" ");
  const org = r.basic.organization_name ? titleCase(r.basic.organization_name) : null;
  const name = individual ? (credential ? `${person}, ${credential}` : person) : org;
  if (!name) return null;
  const dba = (r.other_names ?? []).find((o) => o.code === "3" && o.organization_name)?.organization_name;

  return {
    npi,
    name,
    organization: individual ? null : org,
    practiceName: individual ? null : dba ? titleCase(dba) : org,
    npiType: individual ? "individual" : "organization",
    credential,
    taxonomy: primary.code,
    taxonomyLabel: primary.desc?.trim() || spec.label,
    specialty: spec.id,
    specialtyLabel: spec.label,
    address: titleCase([loc.address_1, loc.address_2].filter(Boolean).join(", ")),
    city: titleCase(loc.city ?? ""),
    state: (loc.state ?? "").toUpperCase(),
    zip: loc.postal_code.slice(0, 5),
    phone: formatPhone(loc.telephone_number),
    homeAddress: homeLike(loc),
    fax: formatPhone(loc.fax_number),
    official: individual
      ? null
      : [r.basic.authorized_official_first_name, r.basic.authorized_official_last_name].filter(Boolean).map((x) => titleCase(x!)).join(" ") || null,
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

/** `postal` is a 5-digit ZIP or a NPPES wildcard like "606*" (every ZIP starting 606). */
export function searchUrl(description: string, postal: string, skip = 0): string {
  const params = new URLSearchParams({
    version: "2.1",
    taxonomy_description: description,
    postal_code: postal,
    limit: "200",
    skip: String(skip),
  });
  return `${NPPES_URL}?${params}`;
}

export function npiUrl(npi: string): string {
  return `${NPPES_URL}?${new URLSearchParams({ version: "2.1", number: npi })}`;
}

type Fetcher = (url: string) => Promise<NppesResponse>;

const defaultFetch: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`The NPI Registry answered ${res.status}.`);
  return (await res.json()) as NppesResponse;
};

// Polite to a free public service: the same question within 6 hours is answered
// from memory, and at most a few questions are in flight at once. A full reply
// is about 1 MB, so the memory keeps the latest 200 (about 200 MB at worst).
const CACHE_MS = 6 * 3600 * 1000;
export const CACHE_MAX = 200;
const cache = new Map<string, { at: number; value: Promise<NppesResponse> }>();

export function cachedFetch(fetcher: Fetcher = defaultFetch, now = () => Date.now()): Fetcher {
  return (url) => {
    const hit = cache.get(url);
    if (hit && now() - hit.at < CACHE_MS) {
      cache.delete(url); // most recently used goes to the end
      cache.set(url, hit);
      return hit.value;
    }
    const value = fetcher(url);
    cache.set(url, { at: now(), value });
    value.catch(() => cache.delete(url));
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    return value;
  };
}

export function clearNppesCache() {
  cache.clear();
}

export function nppesCacheSize(): number {
  return cache.size;
}

export type SearchResult = {
  providers: Provider[];
  /** NPPES questions asked (cached ones count too). */
  requests: number;
  /** True when a search hit NPPES's 1,200-a-search ceiling or our request budget, so the list is partial. */
  truncated: boolean;
  /** Set when the deadline came first: how many of the areas were searched in full. */
  timedOut: { done: number; of: number } | null;
};

const PAGE = 200;
const LAST_SKIP = 1000; // NPPES refuses skip above 1000

/** Every search for these specialties in these ZIPs (or ZIP wildcards), 200 at a time, within a request budget. */
export async function searchProviders(
  specialties: SpecialtyId[],
  postals: string[],
  opts: { fetcher?: Fetcher; maxRequests?: number; concurrency?: number; deadline?: number; now?: () => number } = {},
): Promise<SearchResult> {
  const now = opts.now ?? Date.now;
  const late = () => opts.deadline !== undefined && now() >= opts.deadline;
  const fetcher = opts.fetcher ?? cachedFetch();
  const budget = opts.maxRequests ?? 150;
  const jobs = specialties.flatMap((id) => SPECIALTY_BY_ID.get(id)!.searches).flatMap((d) => postals.map((z) => [d, z] as const));
  const responses: NppesResponse[] = [];
  const queue = [...jobs];
  let requests = 0;
  let truncated = false;
  let timedOut = false;
  // An area counts as done when every one of its searches finished.
  const left = new Map(postals.map((z) => [z, jobs.filter((j) => j[1] === z).length]));
  async function worker() {
    for (let job = queue.shift(); job; job = queue.shift()) {
      for (let skip = 0; skip <= LAST_SKIP; skip += PAGE) {
        if (late()) {
          timedOut = true;
          return;
        }
        if (requests >= budget) {
          truncated = true;
          return;
        }
        requests++;
        const res = await fetcher(searchUrl(job[0], job[1], skip));
        if (res.Errors?.length) break;
        responses.push(res);
        if ((res.results?.length ?? 0) < PAGE) break;
        if (skip === LAST_SKIP) truncated = true;
      }
      left.set(job[1], left.get(job[1])! - 1);
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, jobs.length) }, worker));
  const done = [...left.values()].filter((n) => n === 0).length;
  return {
    providers: parseResponses(responses, new Set(specialties)),
    requests,
    truncated,
    timedOut: timedOut ? { done, of: postals.length } : null,
  };
}

/** The old shape, for the chat tool and the board's Find form. */
export async function fetchProviders(specialties: SpecialtyId[], zips: string[], fetcher?: Fetcher): Promise<Provider[]> {
  return (await searchProviders(specialties, zips, { fetcher, maxRequests: 400 })).providers;
}

/** One provider by NPI, or null when NPPES has no active one we'd list. */
export async function providerByNpi(npi: string, fetcher: Fetcher = cachedFetch()): Promise<Provider | null> {
  if (!/^\d{10}$/.test(npi)) return null;
  const res = await fetcher(npiUrl(npi));
  return parseResponses([res])[0] ?? null;
}
