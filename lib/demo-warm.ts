// `npm run demo:warm` (scripts/demo-warm.ts): before the Nov 4 recording, run the
// Referrals searches the demo shows at ZIP 60614 once, so their answers sit in
// practice_os.referral_fetch_cache and the recording never waits on a public API:
//   - the map (NPI Registry, Dana's niche kinds; Census points), at 1, 3 and 5 miles;
//   - "Places near you" (CMS hospices and home health agencies, OpenStreetMap
//     funeral homes, places of worship, community centres...), at 1, 3 and 5 miles.
// Then, unless asked for the cache only, it puts the nearest few of each kind on
// her board the way "Add to board" does (found, nothing sent), so the board and
// "Who should I reach out to this week?" have real sourced partners next to the
// [Sample] ones. Real public listings may show; nothing is ever sent to them.
// Like db:reset it runs only on the database SUPABASE_PROJECT_REF names.
import type postgres from "postgres";
import { audit } from "./audit";
import { poolerSafeClient } from "./db";
import { DEMO_REFERRAL_KINDS, DEMO_ZIP, resetRefusal } from "./demo-reset";
import { CATEGORY_LABELS, SPECIALTY_CATEGORY } from "./referrals/categories";
import { categoryOf } from "./referrals/catalog";
import { parseArea, practiceContext, searchArea, type AreaProvider, type AreaResult } from "./referrals/area";
import { SPECIALTY_BY_ID, type SpecialtyId } from "./referrals/nppes";
import { discoverOrgs, discoveryContext, discoveryTypes, type DiscoveredOrg, type DiscoveryResult } from "./referrals/orgs";
import { orgToCard, saveOrgCard } from "./referrals/org-store";
import { getReferralSettings } from "./referrals/settings";
import { listSources, saveSources, type FoundSource } from "./referrals/store";
import { scoreVersionFor } from "./referrals/tier";

export { DEMO_ZIP };
/** The radii the demo might pick: the map opens at 1 mile, Places near you at 3; the check counts 5. */
export const WARM_RADII = [1, 3, 5] as const;
/** At most this many of each kind go on the board. */
export const BOARD_PER_KIND = 3;
export const BOARD_MILES = 5;

export type WarmReport = {
  /** The radius the map and Places counts below came from: the widest that answered (null when none did). */
  mapMiles: number | null;
  placesMiles: number | null;
  /** Counts at those radii, by category label. */
  categories: { label: string; count: number }[];
  providers: number;
  /** Of those, placed at the building (the rest at their ZIP's center). */
  atAddress: number;
  places: number;
  /** Sources that didn't answer, in plain words. */
  failed: string[];
  /** Answers that couldn't be kept in referral_fetch_cache (the recording would ask again). */
  notKept: string[];
  /** New cards only: a card already on the board (refreshed) isn't counted. */
  added: { nppes: number; cms: number; osm: number };
};

type Deps = {
  search?: typeof searchArea;
  discover?: typeof discoverOrgs;
  /** Her office, niche and do-not-contact list (practiceContext and discoveryContext). */
  practice?: typeof practiceContext;
  placesContext?: typeof discoveryContext;
  /** Off: only fill the cache. */
  addToBoard?: boolean;
};

export function warmRefusal(url: string, expectedRef: string | undefined): string | null {
  return resetRefusal(url, expectedRef)?.replace("Refusing to reset", "Refusing to warm the demo") ?? null;
}

const FAIL_NOTE = /didn't answer|was slow|ran out of NPI Registry questions/i;

/** Counts per category label, most first. */
export function categoryCounts(providers: Pick<AreaProvider, "specialty">[], orgs: Pick<DiscoveredOrg, "type">[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  const bump = (c: number | null | undefined) => {
    const label = c ? (CATEGORY_LABELS[c] ?? "Other") : "Other";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  };
  for (const p of providers) bump(SPECIALTY_CATEGORY[p.specialty]);
  for (const o of orgs) bump(categoryOf(o.type));
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The nearest few of each kind within BOARD_MILES, never a sensitive one. Sorts by distance itself (the map's list is in tier order). */
export function pickForBoard<T extends { distanceMiles: number | null; sensitive?: boolean }>(items: T[], kindOf: (t: T) => string, per = BOARD_PER_KIND): T[] {
  const byKind = new Map<string, T[]>();
  const nearest = [...items].sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
  for (const it of nearest) {
    if (it.sensitive || it.distanceMiles === null || it.distanceMiles > BOARD_MILES) continue;
    const k = kindOf(it);
    const list = byKind.get(k) ?? [];
    if (list.length < per) byKind.set(k, [...list, it]);
  }
  return [...byKind.values()].flat();
}

export async function warmDemo(opts: { url: string; expectedRef?: string; deps?: Deps; log?: (line: string) => void }): Promise<WarmReport> {
  const refusal = warmRefusal(opts.url, opts.expectedRef ?? process.env.SUPABASE_PROJECT_REF);
  if (refusal) throw new Error(refusal);
  // No pipelining (lib/db.ts): the NPI Registry pages are read and kept four at a time, and
  // on Supabase's transaction pooler a query pipelined behind another never gets its reply.
  const sql = poolerSafeClient(opts.url, { max: 2 });
  try {
    return await warm(sql, opts.deps ?? {}, opts.log ?? (() => {}));
  } finally {
    await sql.end();
  }
}

async function warm(sql: postgres.Sql, deps: Deps, log: (line: string) => void): Promise<WarmReport> {
  const search = deps.search ?? searchArea;
  const discover = deps.discover ?? discoverOrgs;
  const settings = await getReferralSettings(sql);
  const saved = settings.specialties.filter((s): s is SpecialtyId => SPECIALTY_BY_ID.has(s as SpecialtyId));
  const specialties = saved.length ? saved : DEMO_REFERRAL_KINDS.filter((s): s is SpecialtyId => SPECIALTY_BY_ID.has(s as SpecialtyId));
  const area = parseArea(DEMO_ZIP);
  const failed = new Set<string>();
  const notKept = new Set<string>();
  const onStoreError = (what: string) => notKept.add(what);
  let map: AreaResult | null = null;
  let places: DiscoveryResult | null = null;
  let mapMiles: number | null = null;
  let placesMiles: number | null = null;

  const ctx = await (deps.practice ?? practiceContext)(sql);
  const dctx = await (deps.placesContext ?? discoveryContext)(sql);
  for (const radiusMiles of WARM_RADII) {
    try {
      const r = await search({ area, radiusMiles, specialties }, ctx, { sql, onStoreError });
      for (const n of r.notes) if (FAIL_NOTE.test(n)) failed.add(`NPI Registry at ${radiusMiles} mi: ${n}`);
      log(`Map, ${radiusMiles} mi: ${r.providers.length} providers (${r.requests} NPI Registry pages).`);
      map = r;
      mapMiles = radiusMiles;
    } catch (err) {
      failed.add(`NPI Registry at ${radiusMiles} mi: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const types = discoveryTypes(null, dctx.niche);
      const r = await discover({ area, radiusMiles, types, niche: dctx.niche }, dctx, { sql, cards: await listSources(sql), onStoreError });
      for (const n of r.notes) if (FAIL_NOTE.test(n)) failed.add(`Places at ${radiusMiles} mi: ${n}`);
      log(`Places near you, ${radiusMiles} mi: ${r.orgs.length} places.`);
      places = r;
      placesMiles = radiusMiles;
    } catch (err) {
      failed.add(`Places at ${radiusMiles} mi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const providers = map?.providers ?? [];
  const orgs = places?.orgs ?? [];
  const added = { nppes: 0, cms: 0, osm: 0 };
  if (deps.addToBoard !== false) {
    const version = scoreVersionFor(dctx.niche);
    const people = pickForBoard(providers, (p) => p.specialty).map(
      (p): FoundSource => ({ ...p, forceSensitive: p.sensitive === true, distanceMiles: p.distanceMiles, fitScore: p.tier.score, scoreVersion: version }),
    );
    // saveSources counts refreshed cards too; only NPIs not on the board yet are new.
    const npis = people.map((p) => p.npi);
    const onBoard = npis.length ? (await sql<{ npi: string }[]>`select npi from practice_os.referral_sources where npi = any(${npis})`).map((r) => r.npi) : [];
    await saveSources(people, sql);
    added.nppes = new Set(npis.filter((n) => !onBoard.includes(n))).size;
    const cards = await listSources(sql);
    for (const o of pickForBoard(orgs.filter((o) => !o.onBoard), (o) => o.type)) {
      const r = await saveOrgCard(orgToCard(o, o.distanceMiles), { sql, cards, by: "aeon" });
      if (r.added) added[o.origin === "cms_pdc" ? "cms" : "osm"]++;
    }
  }
  const report: WarmReport = {
    mapMiles,
    placesMiles,
    categories: categoryCounts(providers, orgs),
    providers: providers.length,
    atAddress: providers.filter((p) => p.precision === "address").length,
    places: orgs.length,
    failed: [...failed],
    notKept: [...notKept],
    added,
  };
  await audit(
    { actor: "system", action: "demo_warmed", subjectType: "demo", details: { by: "demo:warm", zip: DEMO_ZIP, map_miles: mapMiles, places_miles: placesMiles, providers: report.providers, places: report.places, added, failed: report.failed.length, not_kept: report.notKept.length } },
    sql,
  );
  return report;
}
