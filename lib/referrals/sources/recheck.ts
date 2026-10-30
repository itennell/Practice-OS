// Checking a card again against every source: the NPI Registry, the CMS
// Medicare files, the state license list, OpenStreetMap, and the practice's
// own website for an email. On demand ("Check again" on the card, or in the
// chat), and once a day while the app is open for cards last checked over 30
// days ago, stalest first, a few at a time.
import type postgres from "postgres";
import { audit } from "../../audit";
import { db } from "../../db";
import type { Fact, Origin } from "../evidence/merge";
import { STALE_DAYS } from "../evidence/merge";
import { nppesFacts, nppesNotFound, saveFacts } from "../evidence/store";
import { addressKey, geocodeAddresses, type Point } from "../geocode";
import { zipCenters } from "../geo";
import { looksResidential, providerByNpi, type Provider } from "../nppes";
import { checkCms } from "./cms";
import { checkOsm } from "./osm";
import { checkStateLicense } from "./state-license";
import type { JsonFetcher } from "./http";

export type RecheckDeps = {
  nppes?: (npi: string) => Promise<Provider | null>;
  cms?: JsonFetcher;
  license?: JsonFetcher;
  osm?: JsonFetcher;
  /** Practice website contacts (lib/referrals/email); off when not given. */
  website?: (url: string, card: { name: string }) => Promise<{ facts: Fact[] }>;
  geocode?: (street: string, city: string, state: string, zip: string) => Promise<Point | null>;
  now?: Date;
};

export type RecheckResult = { checked: Origin[]; unavailable: string[]; notes: string[] };

type Card = {
  id: string;
  npi: string | null;
  name: string;
  npi_type: "individual" | "organization" | null;
  credential: string | null;
  taxonomy: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
};

async function defaultGeocode(street: string, city: string, state: string, zip: string): Promise<Point | null> {
  const a = { street, city, state, zip };
  return (await geocodeAddresses([a], { max: 1 })).get(addressKey(a)) ?? null;
}

/** The live sources, for the app's routes and the daily run. */
export function recheckDeps(): RecheckDeps {
  return {};
}

/** Asks every source about one card and saves what each said. Never throws for one source failing. */
export async function recheckSource(id: string, deps: RecheckDeps = {}, sql: postgres.Sql = db()): Promise<RecheckResult> {
  const [card] = await sql<Card[]>`
    select id, npi, name, npi_type, credential, taxonomy, address, city, state, zip, phone, website
      from practice_os.referral_sources where id = ${id}`;
  if (!card) throw new Error("That referral source is no longer on the board.");
  const now = deps.now ?? new Date();
  const at = now.toISOString();
  const facts: Fact[] = [];
  const checked: Origin[] = [];
  const unavailable: string[] = [];
  const notes: string[] = [];
  const isOrg = card.npi_type === "organization";

  if (card.npi) {
    try {
      const p = await (deps.nppes ?? ((n: string) => providerByNpi(n)))(card.npi);
      facts.push(...(p ? nppesFacts(p, at) : [nppesNotFound(card.npi, at)]));
      checked.push("nppes");
    } catch {
      unavailable.push("NPI Registry");
    }
    const cms = await checkCms(card.npi, { fetcher: deps.cms, now });
    facts.push(...cms.facts);
    checked.push(...cms.checked);
    unavailable.push(...cms.unavailable);
  }

  try {
    const lic = await checkStateLicense(
      { name: card.name, credential: card.credential, taxonomy: card.taxonomy, city: card.city, state: card.state, npiType: card.npi_type },
      { fetcher: deps.license, now },
    );
    facts.push(...lic.facts);
    if (lic.checked) checked.push("state_license");
    if (lic.note) notes.push(lic.note);
  } catch {
    unavailable.push("State license list");
  }

  // A home-looking address is never sent to a map service; its ZIP center is enough to look nearby.
  const street = card.address && !looksResidential(card.address) ? card.address : null;
  let point: Point | null = null;
  let exact = false;
  if (street && card.city && card.state && card.zip) {
    point = await (deps.geocode ?? defaultGeocode)(street, card.city, card.state, card.zip).catch(() => null);
    exact = Boolean(point);
  }
  if (!point && card.zip) point = (await zipCenters())[card.zip] ?? null;
  try {
    const osm = await checkOsm({ name: card.name, isOrg, street, zip: card.zip, phone: card.phone, point, exact }, { fetcher: deps.osm, now });
    facts.push(...osm.facts);
    if (osm.checked) checked.push("osm");
  } catch {
    unavailable.push("OpenStreetMap");
  }

  // Their own website: the one she typed or OpenStreetMap gave.
  const site = facts.find((f) => f.field === "website")?.value ?? card.website;
  if (site && deps.website) {
    try {
      const web = await deps.website(site, { name: card.name });
      facts.push(...web.facts);
      checked.push("website");
    } catch {
      unavailable.push("Their website");
    }
  }

  await saveFacts(card.id, facts, { checked, sql });
  await audit({ actor: "aeon", action: "referral_source_checked", subjectType: "referral_source", subjectId: card.id, details: { checked, unavailable } }, sql);
  return { checked, unavailable, notes };
}

/** Cards last checked over 30 days ago (or never), stalest first. */
export async function staleSources(max: number, sql: postgres.Sql = db(), now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - STALE_DAYS * 86_400_000);
  const rows = await sql<{ id: string }[]>`
    select id from practice_os.referral_sources
     where stage <> 'not_a_fit' and (checked_at is null or checked_at < ${cutoff})
     order by checked_at nulls first, fit_score desc nulls last
     limit ${max}`;
  return rows.map((r) => r.id);
}

/** The daily re-check for a local install (no cron): runs when the last one is a day old. */
export async function recheckIfDue(deps: RecheckDeps = {}, sql: postgres.Sql = db(), max = 10): Promise<number | null> {
  const [last] = await sql<{ at: Date }[]>`
    select at from practice_os.audit_log where action = 'referral_recheck_run' order by at desc limit 1`;
  const now = deps.now ?? new Date();
  if (last && now.getTime() - last.at.getTime() < 24 * 3600 * 1000) return null;
  // Written first, so two tabs opening at once don't both run it.
  await audit({ actor: "system", action: "referral_recheck_run", subjectType: "referral_sources" }, sql);
  let done = 0;
  for (const id of await staleSources(max, sql, now)) {
    await recheckSource(id, deps, sql).catch((err) => console.error(`[referrals] recheck ${id}: ${err instanceof Error ? err.message : String(err)}`));
    done++;
  }
  return done;
}
