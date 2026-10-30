// The CMS Medicare files, asked by NPI (free, no key; checked live 2026-10-29,
// docs/research.md "Referrals v2"): the Doctors and Clinicians file (group,
// address, phone), Order and Referring (may order and refer for Medicare), and
// Opt Out Affidavits (left Medicare, common in private pay). A clinician
// missing from them is normal: they list only Medicare-enrolled people.
import type { Fact } from "../evidence/merge";
import { addressLine, formatPhone, phoneDigits } from "../evidence/normalize";
import { jsonFetcher, str, type JsonFetcher } from "./http";
import { titleCase } from "../nppes";

export const DAC_URL = "https://data.cms.gov/provider-data/api/1/datastore/query/mj5m-pzi6/0";
export const ORDER_REFERRING_URL = "https://data.cms.gov/data-api/v1/dataset/c99b5865-1119-4436-bb80-c5af2773ea1f/data";
export const OPT_OUT_URL = "https://data.cms.gov/data-api/v1/dataset/9887a515-7552-4693-bf58-735c77af46d7/data";
const DAC_PAGE = "https://data.cms.gov/provider-data/dataset/mj5m-pzi6";
const ORDER_PAGE = "https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/order-and-referring";
const OPT_OUT_PAGE = "https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/opt-out-affidavits";

export function dacUrl(npi: string): string {
  const q = new URLSearchParams({
    "conditions[0][property]": "npi",
    "conditions[0][value]": npi,
    "conditions[0][operator]": "=",
    limit: "10",
  });
  return `${DAC_URL}?${q}`;
}

type DacRow = Record<string, unknown>;

/** The Doctors and Clinicians file's rows for an NPI, as facts. One NPI has a row per group and address; the first is used. */
export function dacFacts(npi: string, reply: unknown, checkedAt: string): Fact[] {
  const rows = ((reply as { results?: DacRow[] })?.results ?? []).filter((r) => str(r.npi) === npi);
  if (rows.length === 0) return [];
  const r = rows[0];
  const base = { origin: "cms_dac" as const, originUrl: DAC_PAGE, method: "npi" as const, score: 1, checkedAt };
  const facts: Fact[] = [{ ...base, field: "medicare", value: "enrolled" }];
  const person = [str(r.provider_first_name), str(r.provider_last_name)].filter(Boolean).join(" ");
  if (person) facts.push({ ...base, field: "name", value: titleCase(person) });
  const group = str(r.facility_name);
  if (group) facts.push({ ...base, field: "organization", value: titleCase(group), detail: { groups: rows.length } });
  const street = [str(r.adr_ln_1), str(r.adr_ln_2)].filter(Boolean).join(", ");
  const zip = (str(r.zip_code) ?? "").slice(0, 5);
  if (street && zip) facts.push({ ...base, field: "address", value: addressLine(titleCase(street), titleCase(str(r.citytown) ?? ""), str(r.state), zip) });
  const phone = phoneDigits(str(r.telephone_number));
  if (phone) facts.push({ ...base, field: "phone", value: formatPhone(phone) });
  return facts;
}

/** Order and Referring: which Medicare benefits they may order or refer for. */
export function orderReferringFacts(npi: string, reply: unknown, checkedAt: string): Fact[] {
  const row = (Array.isArray(reply) ? (reply as DacRow[]) : []).find((r) => str(r.NPI) === npi);
  if (!row) return [];
  const can = ["PARTB", "DME", "HHA", "PMD", "HOSPICE"].filter((k) => str(row[k]) === "Y");
  const base = { origin: "cms_order_referring" as const, originUrl: ORDER_PAGE, method: "npi" as const, score: 1, checkedAt };
  return [{ ...base, field: "medicare", value: "enrolled", detail: { mayOrderFor: can } }];
}

/** Opt Out Affidavits: an opt-out still in effect. */
export function optOutFacts(npi: string, reply: unknown, checkedAt: string, today = new Date()): Fact[] {
  const row = (Array.isArray(reply) ? (reply as DacRow[]) : []).find((r) => str(r.NPI) === npi);
  if (!row) return [];
  const end = str(row["Optout End Date"]);
  const ended = end ? new Date(end).getTime() < today.getTime() : false;
  const base = { origin: "cms_opt_out" as const, originUrl: OPT_OUT_PAGE, method: "npi" as const, score: 1, checkedAt };
  const facts: Fact[] = [{ ...base, field: "opt_out", value: ended ? "ended" : "yes", detail: { from: str(row["Optout Effective Date"]), to: end } }];
  const street = [str(row["First Line Street Address"]), str(row["Second Line Street Address"])].filter(Boolean).join(", ");
  const zip = (str(row["Zip Code"]) ?? "").slice(0, 5);
  if (street && zip) facts.push({ ...base, field: "address", value: addressLine(titleCase(street), titleCase(str(row["City Name"]) ?? ""), str(row["State Code"]), zip) });
  return facts;
}

export type CmsResult = { facts: Fact[]; checked: Fact["origin"][]; unavailable: string[] };

/** All three CMS files for one NPI. A file that doesn't answer is skipped and named in `unavailable`. */
export async function checkCms(npi: string, opts: { fetcher?: JsonFetcher; now?: Date } = {}): Promise<CmsResult> {
  const fetcher = opts.fetcher ?? jsonFetcher("Medicare (data.cms.gov)");
  const now = opts.now ?? new Date();
  const checkedAt = now.toISOString();
  const by = `?${new URLSearchParams({ "filter[NPI]": npi })}`;
  const asks = [
    { origin: "cms_dac" as const, label: "Medicare clinician file", url: dacUrl(npi), parse: (r: unknown) => dacFacts(npi, r, checkedAt) },
    { origin: "cms_order_referring" as const, label: "Medicare order and referring list", url: ORDER_REFERRING_URL + by, parse: (r: unknown) => orderReferringFacts(npi, r, checkedAt) },
    { origin: "cms_opt_out" as const, label: "Medicare opt-out list", url: OPT_OUT_URL + by, parse: (r: unknown) => optOutFacts(npi, r, checkedAt, now) },
  ];
  const out: CmsResult = { facts: [], checked: [], unavailable: [] };
  for (const a of asks) {
    try {
      out.facts.push(...a.parse(await fetcher(a.url)));
      out.checked.push(a.origin);
    } catch {
      out.unavailable.push(a.label);
    }
  }
  return out;
}
