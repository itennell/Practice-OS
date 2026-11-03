// Organisations near her, beyond the NPI Registry: hospices and home health
// agencies from the CMS Provider Data Catalog, and funeral homes, places of
// worship, libraries and community centres and senior living from
// OpenStreetMap. Read only: nothing is saved until she presses "Add to board"
// (or the chat's find tool saves the best few, as it does for NPPES). Only the
// area and the kinds of place leave the app, never anything about a client.
// Places of worship are asked for only when she picked them or her niche lists them.
import type postgres from "postgres";
import { audit } from "../audit";
import { db } from "../db";
import { AreaError, FAR_MILES, MAX_ZIPS, parseArea, placeAllowed, practiceContext, zipsNear, type Area } from "./area";
import { SOURCE_TYPE_BY_ID } from "./catalog";
import { suppressedList } from "./contacts";
import { findDuplicate } from "./dedupe";
import { isSuppressed, type Suppressed } from "./dnc-key";
import { geocodePlace, type Point } from "./geocode";
import { haversineMiles, zipCenters } from "./geo";
import { orgToCard, saveOrgCard, type SaveResult } from "./org-store";
import { cmsByCcn, searchCmsAgencies, type CmsAgencyType, type FoundOrg } from "./sources/cms-agencies";
import { OSM_ATTRIBUTION, osmByRef, osmTypes, searchOsmOrgs } from "./sources/osm-orgs";
import { listSources, type ReferralSource } from "./store";
import { isSensitiveSource } from "./sensitive";

export { parseArea };

const CMS_TYPES: CmsAgencyType[] = ["hospice", "home_health"];

/** Every kind of place these sources can find, in the order the page shows them. */
export function discoverableTypes(): { id: string; label: string; source: "cms" | "osm" }[] {
  const cms = CMS_TYPES.filter((t) => SOURCE_TYPE_BY_ID.has(t)).map((id) => ({ id, label: SOURCE_TYPE_BY_ID.get(id)!.label, source: "cms" as const }));
  const osm = osmTypes().map((id) => ({ id, label: SOURCE_TYPE_BY_ID.get(id)!.label, source: "osm" as const }));
  return [...cms, ...osm];
}

export const DISCOVERY_IDS = ["hospice", "home_health", "funeral_homes", "clergy", "libraries_community_centers", "senior_living", "fitness_yoga"] as const;
export type DiscoveryId = (typeof DISCOVERY_IDS)[number];

/** Without a pick: the kinds her niche lists (places of worship only if it does), else these. */
export const DEFAULT_DISCOVERY: DiscoveryId[] = ["hospice", "home_health", "funeral_homes", "libraries_community_centers", "senior_living"];

/** OpenStreetMap is asked about at most this far: a city has hundreds of places within 10 miles. */
export const OSM_MAX_MILES = 5;

/** What she picked, or her niche's kinds; places of worship only when she picked them or her niche lists them. */
export function discoveryTypes(picked: string[] | null | undefined, niche: string | null): DiscoveryId[] {
  const known = new Set<string>(DISCOVERY_IDS);
  if (picked?.length) return [...new Set(picked.filter((t): t is DiscoveryId => known.has(t)))];
  const forNiche = niche ? DISCOVERY_IDS.filter((t) => SOURCE_TYPE_BY_ID.get(t)?.niches.includes(niche)) : [];
  return forNiche.length ? forNiche : DEFAULT_DISCOVERY;
}

export type DiscoveredOrg = FoundOrg & {
  typeLabel: string;
  distanceMiles: number | null;
  /** The card already on her board for this place, if any. */
  onBoard: { id: string; stage: string } | null;
};

export type DiscoveryResult = {
  label: string;
  center: Point;
  zips: string[];
  types: DiscoveryId[];
  orgs: DiscoveredOrg[];
  notes: string[];
  /** Shown wherever these results show (ODbL for OpenStreetMap; the CMS dataset ids). */
  attribution: string[];
};

type Ctx = { office: Point | null; officeZip: string | null; state: string; suppressed?: Suppressed };

type Deps = {
  cms?: typeof searchCmsAgencies;
  osm?: typeof searchOsmOrgs;
  place?: typeof geocodePlace;
  check?: (text: string) => Promise<boolean>;
  centers?: Record<string, Point>;
  cards?: Pick<ReferralSource, "id" | "name" | "npi" | "ccn" | "osm_ref" | "organization" | "npi_type" | "address" | "city" | "zip" | "phone" | "stage">[];
  sql?: postgres.Sql | null;
};

/** Where to look: a ZIP (or a few), a typed place, or her own ZIP. Chicagoland is too wide here. */
async function resolve(area: Area, radiusMiles: number, ctx: Ctx, deps: Deps) {
  const centers = deps.centers ?? (await zipCenters());
  const notes: string[] = [];
  const a = area.kind === "empty" && ctx.officeZip ? ({ kind: "zips", zips: [ctx.officeZip] } as Area) : area;
  if (a.kind === "empty") throw new AreaError("Type a ZIP code, a city or a neighborhood.");
  if (a.kind === "chicagoland") throw new AreaError("That's too wide for these places. Type a ZIP code or a neighborhood.");
  if (area.kind === "empty") notes.push(`You didn't type an area, so I searched around your ZIP code, ${ctx.officeZip}.`);
  const office = ctx.office ?? (ctx.officeZip ? (centers[ctx.officeZip] ?? null) : null);
  let points: Point[];
  let label: string;
  if (a.kind === "zips") {
    const unknown = a.zips.filter((z) => !centers[z]);
    if (unknown.length) throw new AreaError(`I don't know ZIP ${unknown.join(", ")}. Check it and try again.`);
    points = a.zips.map((z) => centers[z]);
    label = a.zips.join(", ");
  } else {
    const place = (a as { place: string }).place;
    if (!(await (deps.check ?? ((t: string) => placeAllowed(t)))(place))) {
      throw new AreaError("That looks like it could be about a person, so I didn't look it up. Try a ZIP code or a city instead.");
    }
    const hit = await (deps.place ?? geocodePlace)(place, ctx.state || "Illinois");
    if (!hit) throw new AreaError(`I couldn't find "${place}" on the map. Try a ZIP code or a nearby city.`);
    const miles = office ? haversineMiles(office, hit.point) : null;
    if (miles !== null && miles > FAR_MILES) throw new AreaError(`"${place}" matched ${hit.label}, about ${Math.round(miles)} miles from your office, so I didn't search there.`);
    points = [hit.point];
    label = hit.label;
  }
  const near = zipsNear(centers, points, radiusMiles, MAX_ZIPS);
  let zips = [...new Set([...(a.kind === "zips" ? a.zips : []), ...near.zips])].slice(0, MAX_ZIPS);
  if (zips.length === 0) zips = zipsNear(centers, points, 50, 1).zips;
  if (near.capped) notes.push(`That radius covers more than ${MAX_ZIPS} ZIP codes, so I searched the ${MAX_ZIPS} nearest.`);
  return { centers, center: points[0], label, zips, office, notes };
}

/** The organisations near an area, nearest first, with what is already on her board. Saves nothing. */
export async function discoverOrgs(req: { area: Area; radiusMiles: number; types?: string[] | null; niche?: string | null }, ctx: Ctx, deps: Deps = {}): Promise<DiscoveryResult> {
  const types = discoveryTypes(req.types, req.niche ?? null);
  if (types.length === 0) throw new AreaError("Pick at least one kind of place.");
  const { centers, center, label, zips, office, notes } = await resolve(req.area, req.radiusMiles, ctx, deps);
  const cmsTypes = types.filter((t): t is CmsAgencyType => (CMS_TYPES as string[]).includes(t));
  const osmPicked = types.filter((t) => !(CMS_TYPES as string[]).includes(t));
  const attribution: string[] = [];
  const found: FoundOrg[] = [];
  if (cmsTypes.length) {
    const r = await (deps.cms ?? searchCmsAgencies)(cmsTypes, zips, { sql: deps.sql });
    found.push(...r.orgs);
    for (const u of r.unavailable) notes.push(`${u} didn't answer. Try again in a minute.`);
    attribution.push(
      `Hospices and home health agencies: CMS Provider Data Catalog (${cmsTypes.map((t) => (t === "hospice" ? "dataset yc9t-dgbk" : "dataset 6jpm-sxkc")).join(", ")}), Medicare-certified agencies by office address.`,
    );
  }
  if (osmPicked.length) {
    const miles = Math.min(req.radiusMiles, OSM_MAX_MILES);
    if (req.radiusMiles > OSM_MAX_MILES) notes.push(`OpenStreetMap places are shown within ${OSM_MAX_MILES} miles.`);
    try {
      const r = await (deps.osm ?? searchOsmOrgs)(osmPicked, center, miles, { sql: deps.sql });
      found.push(...r.orgs);
      for (const t of r.capped) notes.push(`There are many ${SOURCE_TYPE_BY_ID.get(t)?.label.toLowerCase() ?? t} nearby, so this shows the nearest.`);
    } catch {
      notes.push("OpenStreetMap didn't answer. Try again in a minute.");
    }
    attribution.push(`Places: ${OSM_ATTRIBUTION}.`);
  }
  const blocked = ctx.suppressed ?? { npis: new Set<string>(), orgs: [] };
  const cards = deps.cards ?? [];
  const orgs: DiscoveredOrg[] = [];
  for (const o of found) {
    const keyCard = { name: o.name, organization: o.name, npi_type: "organization" as const, address: o.street, city: o.city, zip: o.zip };
    // Someone on her do-not-contact list never shows again.
    if (isSuppressed(keyCard, blocked)) continue;
    // The same agency from both sources: CMS's row is kept.
    const twin = findDuplicate({ name: o.name, isOrg: true, street: o.street, city: o.city, zip: o.zip, phone: o.phone }, orgs.map((x) => ({ id: x.key, name: x.name, npi_type: "organization" as const, address: x.street, city: x.city, zip: x.zip, phone: x.phone })));
    if (twin) continue;
    // A DV/SA agency or shelter by name: city only, no street, ZIP, point or distance (lib/referrals/sensitive.ts).
    if (isSensitiveSource({ type: o.type, name: o.name })) {
      orgs.push({ ...o, street: null, zip: null, lat: null, lon: null, precision: "zip", distanceMiles: null, typeLabel: SOURCE_TYPE_BY_ID.get(o.type)?.label ?? o.type, onBoard: null });
      continue;
    }
    const point: Point | null = o.lat !== null && o.lon !== null ? [o.lat, o.lon] : o.zip ? (centers[o.zip] ?? null) : null;
    const dup = findDuplicate({ ccn: o.ccn, osmRef: o.osmRef, name: o.name, isOrg: true, street: o.street, city: o.city, zip: o.zip, phone: o.phone }, cards);
    orgs.push({
      ...o,
      lat: point?.[0] ?? null,
      lon: point?.[1] ?? null,
      typeLabel: SOURCE_TYPE_BY_ID.get(o.type)?.label ?? o.type,
      distanceMiles: office && point ? Math.round(haversineMiles(office, point) * 10) / 10 : null,
      onBoard: dup ? { id: dup.card.id, stage: dup.card.stage } : null,
    });
  }
  orgs.sort((a, b) => (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99) || a.name.localeCompare(b.name));
  if (!office) notes.push("Add your office address in setup so distances are from your door.");
  return { label, center, zips, types, orgs, notes, attribution };
}

/** Her office ZIP, state and niche, and her do-not-contact list, for a discovery search. */
export async function discoveryContext(sql: postgres.Sql = db()): Promise<Ctx & { niche: string | null }> {
  const base = await practiceContext(sql);
  const [row] = await sql<{ niche_preset: string | null }[]>`select niche_preset from practice_os.referral_settings where id`.catch(() => []);
  return { office: base.office, officeZip: base.officeZip, state: base.state, suppressed: await suppressedList(sql), niche: row?.niche_preset ?? null };
}

/**
 * "Add to board" for found organisations. The page sends ids only ("cms:<CCN>",
 * "osm:node/123"); each is looked up again at its source before it is saved.
 */
export async function addOrgsToBoard(
  keys: string[],
  opts: { sql?: postgres.Sql; by?: "clinician" | "aeon"; center?: Point | null; distances?: Record<string, number | null>; cms?: typeof cmsByCcn; osm?: typeof osmByRef } = {},
): Promise<{ added: SaveResult[]; matched: SaveResult[]; missing: string[]; refused: string[] }> {
  const sql = opts.sql ?? db();
  const uniq = [...new Set(keys)].slice(0, 50);
  const ccns = uniq.filter((k) => k.startsWith("cms:")).map((k) => k.slice(4));
  const refs = uniq.filter((k) => k.startsWith("osm:")).map((k) => k.slice(4));
  const center = opts.center ?? [41.8819, -87.6278];
  const looked: FoundOrg[] = [
    ...(ccns.length ? await (opts.cms ?? cmsByCcn)(ccns, { sql }) : []),
    ...(refs.length ? await (opts.osm ?? osmByRef)(refs, osmTypes(), center, { sql }) : []),
  ];
  const cards = await listSources(sql);
  const added: SaveResult[] = [];
  const matched: SaveResult[] = [];
  const refused: string[] = [];
  for (const o of looked) {
    const miles = opts.distances?.[o.key];
    const r = await saveOrgCard(orgToCard(o, typeof miles === "number" && Number.isFinite(miles) ? miles : null), { sql, cards });
    if (r.added) added.push(r);
    else if (r.matched) matched.push(r);
    else if (r.refused) refused.push(r.refused);
  }
  const missing = uniq.filter((k) => !looked.some((o) => o.key === k));
  await audit({ actor: opts.by ?? "clinician", action: "referral_orgs_added", subjectType: "referral_sources", details: { added: added.length, matched: matched.length, missing } }, sql);
  return { added, matched, missing, refused };
}

/** Per kind, the nearest this many go on the board from the chat (like NPPES's best few). */
export const CHAT_PER_TYPE = 5;

/**
 * The chat's find tool: organisations of the kinds she asked for around a ZIP,
 * the nearest few of each saved to her board under Found. Returns plain facts
 * for the reply, each with where it came from.
 */
export async function findOrgsForChat(
  zip: string,
  types: string[],
  opts: { radiusMiles?: number; show?: number; sql?: postgres.Sql; deps?: Deps } = {},
): Promise<Record<string, unknown>> {
  const sql = opts.sql ?? db();
  const ctx = await discoveryContext(sql);
  let result: DiscoveryResult;
  try {
    result = await discoverOrgs({ area: { kind: "zips", zips: [zip] }, radiusMiles: opts.radiusMiles ?? 3, types }, ctx, { sql, cards: await listSources(sql), ...opts.deps });
  } catch (err) {
    if (err instanceof AreaError) return { organizations_found: 0, why: err.message };
    throw err;
  }
  const keep: DiscoveredOrg[] = [];
  for (const t of result.types) keep.push(...result.orgs.filter((o) => o.type === t).slice(0, CHAT_PER_TYPE));
  const cards = await listSources(sql);
  const saved: (DiscoveredOrg & { cardId: string; already: boolean })[] = [];
  for (const o of keep) {
    const r = await saveOrgCard(orgToCard(o, o.distanceMiles), { sql, cards, by: "aeon" });
    if (r.refused) continue;
    saved.push({ ...o, cardId: r.id, already: !r.added });
  }
  await audit({ actor: "aeon", action: "referral_orgs_found", subjectType: "referral_sources", details: { zip, types: result.types, found: result.orgs.length, saved: saved.filter((s) => !s.already).length } }, sql);
  const shown = saved.slice(0, opts.show ?? 10);
  return {
    kinds: result.types,
    organizations_found: result.orgs.length,
    on_board: `${saved.length} nearest are on the Referrals board under Found (/referrals)${saved.some((s) => s.already) ? "; some were already there" : ""}.`,
    places: shown.map((o, i) => ({
      rank: i + 1,
      id: o.cardId,
      name: o.name,
      kind: o.typeLabel,
      miles: o.distanceMiles,
      address: [o.street, o.city, [o.state, o.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
      phone: o.phone,
      website: o.website,
      source: o.origin === "cms_pdc" ? `CMS Provider Data Catalog${o.ccn ? `, CCN ${o.ccn}` : ""}` : `OpenStreetMap (${OSM_ATTRIBUTION})`,
      already_on_board: o.already || undefined,
    })),
    ...(result.notes.length ? { notes: result.notes } : {}),
    attribution: result.attribution,
  };
}
