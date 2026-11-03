// Hospices and home health agencies near her, from the CMS Provider Data
// Catalog (free, no key, public domain US government data). Two datasets,
// asked by ZIP with the catalog's datastore query API (checked live 2026-11-02):
//   Hospice - General Information, dataset yc9t-dgbk
//     https://data.cms.gov/provider-data/dataset/yc9t-dgbk
//   Home Health Care Agencies, dataset 6jpm-sxkc
//     https://data.cms.gov/provider-data/dataset/6jpm-sxkc
// Each row is a Medicare-certified agency with its CMS certification number
// (CCN), office address and phone. One request per dataset per search (up to
// 12 ZIPs at once), cached a day, one at a time to data.cms.gov.
import type postgres from "postgres";
import { formatPhone, phoneDigits, zip5 } from "../evidence/normalize";
import type { Fact } from "../evidence/merge";
import { titleCase } from "../nppes";
import { cachedJson, waitTurn } from "./cache";
import { jsonFetcher, str, type JsonFetcher } from "./http";

export type CmsAgencyType = "hospice" | "home_health";

export const CMS_DATASETS: Record<CmsAgencyType, { id: string; title: string; page: string; name: string; street: string[] }> = {
  hospice: {
    id: "yc9t-dgbk",
    title: "Hospice - General Information",
    page: "https://data.cms.gov/provider-data/dataset/yc9t-dgbk",
    name: "facility_name",
    street: ["address_line_1", "address_line_2"],
  },
  home_health: {
    id: "6jpm-sxkc",
    title: "Home Health Care Agencies",
    page: "https://data.cms.gov/provider-data/dataset/6jpm-sxkc",
    name: "provider_name",
    street: ["address"],
  },
};

const QUERY_BASE = "https://data.cms.gov/provider-data/api/1/datastore/query";
/** At most this many agencies per kind are shown, the nearest ones (lib/referrals/orgs.ts sorts by distance first). */
export const CMS_LIMIT = 100;
/** Rows per datastore page, and at most this many pages per dataset per search (all asked before any is cut). */
export const CMS_PAGE = 100;
export const CMS_MAX_PAGES = 5;
const SPACING_MS = 500;

/** The datastore query for one dataset: the agencies in these ZIPs (or with these CCNs). */
export function pdcUrl(type: CmsAgencyType, by: { zips: string[] } | { ccns: string[] }, offset = 0): string {
  const q = new URLSearchParams();
  const [property, values] = "zips" in by ? ["zip_code", by.zips] : ["cms_certification_number_ccn", by.ccns];
  q.set("conditions[0][property]", property);
  for (const v of [...new Set(values)].sort()) q.append("conditions[0][value][]", v);
  q.set("conditions[0][operator]", "in");
  q.set("limit", String(CMS_PAGE));
  if (offset) q.set("offset", String(offset));
  return `${QUERY_BASE}/${CMS_DATASETS[type].id}/0?${q}`;
}

/** One organisation found by a discovery source (CMS or OpenStreetMap), before it is a card. */
export type FoundOrg = {
  /** "cms:<CCN>" or "osm:node/123": the id the page sends back to add it. */
  key: string;
  type: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  ccn: string | null;
  osmRef: string | null;
  /** Where a point came from: the place itself (OpenStreetMap) or its ZIP's center. */
  lat: number | null;
  lon: number | null;
  precision: "address" | "zip";
  origin: "cms_pdc" | "osm";
  originUrl: string;
  checkedAt: string;
};

const clean = (v: unknown) => {
  const s = str(v);
  return s && s !== "-" ? s : null;
};

/** The dataset's rows as organisations. Rows without a CCN, a name or a ZIP are skipped. */
export function parsePdc(type: CmsAgencyType, reply: unknown, checkedAt: string): FoundOrg[] {
  const d = CMS_DATASETS[type];
  const rows = (reply as { results?: Record<string, unknown>[] })?.results ?? [];
  const out: FoundOrg[] = [];
  for (const r of rows) {
    const ccn = clean(r.cms_certification_number_ccn)?.toUpperCase() ?? null;
    const name = clean(r[d.name]);
    const zip = zip5(clean(r.zip_code));
    if (!ccn || !/^[0-9A-Z]{6}$/.test(ccn) || !name || !zip) continue;
    const street = d.street.map((k) => clean(r[k])).filter(Boolean).join(", ") || null;
    const phone = phoneDigits(clean(r.telephone_number));
    out.push({
      key: `cms:${ccn}`,
      type,
      name: titleCase(name),
      street: street ? titleCase(street) : null,
      city: clean(r.citytown) ? titleCase(clean(r.citytown)!) : null,
      state: clean(r.state),
      zip,
      phone: phone ? formatPhone(phone) : null,
      website: null,
      ccn,
      osmRef: null,
      lat: null,
      lon: null,
      precision: "zip",
      origin: "cms_pdc",
      originUrl: d.page,
      checkedAt,
    });
  }
  return out;
}

/** What the catalog says about an agency, as card facts ("Confirmed by CMS Provider Data Catalog"). */
export function pdcFacts(org: FoundOrg): Fact[] {
  const type = org.type as CmsAgencyType;
  const base = {
    origin: "cms_pdc" as const,
    originUrl: org.originUrl,
    method: "name_address" as const,
    score: 1,
    checkedAt: org.checkedAt,
    detail: { ccn: org.ccn, dataset: CMS_DATASETS[type]?.id, label: CMS_DATASETS[type]?.title },
  };
  const facts: Fact[] = [{ ...base, field: "name", value: org.name }];
  const line = [org.street, org.city, [org.state, org.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (org.street && org.zip) facts.push({ ...base, field: "address", value: line });
  if (org.phone) facts.push({ ...base, field: "phone", value: org.phone });
  return facts;
}

type Deps = { fetcher?: JsonFetcher; sql?: postgres.Sql | null; now?: () => Date };

async function ask(url: string, deps: Deps): Promise<unknown> {
  const fetcher = deps.fetcher ?? jsonFetcher("CMS Provider Data Catalog (data.cms.gov)", 20_000);
  return cachedJson(
    url,
    async () => {
      await waitTurn("data.cms.gov", SPACING_MS);
      return fetcher(url);
    },
    { sql: deps.sql, host: "data.cms.gov", source: "CMS Provider Data Catalog" },
  );
}

/** Hospices and/or home health agencies with an office in these ZIPs. A dataset that doesn't answer is named in `unavailable`. */
/**
 * Hospices and/or home health agencies with an office in these ZIPs: every
 * page (up to CMS_MAX_PAGES), so the caller can sort by distance before it
 * keeps the nearest. `more`: kinds the catalog had more rows for than were read.
 */
export async function searchCmsAgencies(types: CmsAgencyType[], zips: string[], deps: Deps = {}): Promise<{ orgs: FoundOrg[]; unavailable: string[]; more?: CmsAgencyType[] }> {
  const checkedAt = (deps.now?.() ?? new Date()).toISOString();
  const orgs: FoundOrg[] = [];
  const unavailable: string[] = [];
  const more: CmsAgencyType[] = [];
  if (zips.length === 0) return { orgs, unavailable, more };
  for (const type of types) {
    try {
      for (let page = 0; page < CMS_MAX_PAGES; page++) {
        const reply = (await ask(pdcUrl(type, { zips }, page * CMS_PAGE), deps)) as { results?: unknown[]; count?: number };
        orgs.push(...parsePdc(type, reply, checkedAt));
        const got = reply?.results?.length ?? 0;
        if (got < CMS_PAGE) break;
        if (page === CMS_MAX_PAGES - 1 && (reply.count ?? 0) > CMS_PAGE * CMS_MAX_PAGES) more.push(type);
      }
    } catch {
      unavailable.push(`CMS ${CMS_DATASETS[type].title}`);
    }
  }
  return { orgs, unavailable, more };
}

/** Agencies by CCN, looked up again before they are saved (the page sends ids only). */
export async function cmsByCcn(ccns: string[], deps: Deps = {}): Promise<FoundOrg[]> {
  const ok = ccns.filter((c) => /^[0-9A-Z]{6}$/.test(c));
  if (ok.length === 0) return [];
  const checkedAt = (deps.now?.() ?? new Date()).toISOString();
  const out: FoundOrg[] = [];
  for (const type of Object.keys(CMS_DATASETS) as CmsAgencyType[]) {
    const rows = parsePdc(type, await ask(pdcUrl(type, { ccns: ok }), deps), checkedAt);
    out.push(...rows.filter((r) => ok.includes(r.ccn!) && !out.some((o) => o.ccn === r.ccn)));
  }
  return out;
}
