// The map's search: an area (ZIP codes, a city or neighborhood, or all of
// Chicagoland) and a radius, to every matching provider in the NPI Registry,
// placed on the map and put in tiers. Read only: nothing is saved until she
// presses "Add to board". Only the area and the kinds of provider leave the
// app, never anything about a client.
import type postgres from "postgres";
import { guard } from "../aeon/guard";
import { db } from "../db";
import { suppressedList } from "./contacts";
import { isSuppressed, type Suppressed } from "./dnc-key";
import { geocodeAddresses, geocodePlace, addressKey, type Point } from "./geocode";
import { haversineMiles, zipCenters } from "./geo";
import { isKnownPlace } from "./places";
import { searchProviders, SPECIALTY_BY_ID, type Provider, type SpecialtyId } from "./nppes";
import { getReferralSettings } from "./settings";
import { outOfStateWarning, stateCode, stateName } from "./states";
import { capFirst, focusFrom, providerTier, TIERS, type Focus, type TierResult } from "./tier";
import { isSensitiveSource, withoutDistance } from "./sensitive";

type Centers = Record<string, Point>;

export type Area =
  | { kind: "zips"; zips: string[] }
  | { kind: "place"; place: string }
  | { kind: "chicagoland" }
  | { kind: "empty" };

/** What she typed in the area box, read in plain code. */
export function parseArea(text: string): Area {
  const t = text.trim();
  if (!t) return { kind: "empty" };
  if (/^(all of )?chicagoland$/i.test(t)) return { kind: "chicagoland" };
  const zips = t.match(/\b\d{5}\b/g);
  if (zips && t.replace(/\b\d{5}\b|[\s,;]+/g, "") === "") return { kind: "zips", zips: [...new Set(zips)] };
  return { kind: "place", place: t.slice(0, 80) };
}

// Chicagoland: every Illinois ZIP tabulation area (Census 2020 ZCTA Gazetteer,
// lib/referrals/zcta-centers.json) whose center is within 30 miles of the Loop
// (State and Madison, 41.8819, -87.6278). That covers Cook, DuPage and the near
// parts of Lake, Will and Kane counties.
export const LOOP: Point = [41.8819, -87.6278];
export const CHICAGOLAND_MILES = 30;

export function chicagolandZips(centers: Centers): string[] {
  return Object.entries(centers)
    .filter(([z, c]) => z.startsWith("60") && haversineMiles(LOOP, c) <= CHICAGOLAND_MILES)
    .map(([z]) => z)
    .sort();
}

/** ZIPs whose centers are within `miles` of any of these points, nearest first, at most `max`. */
export function zipsNear(centers: Centers, points: Point[], miles: number, max: number): { zips: string[]; capped: boolean } {
  const near = Object.entries(centers)
    .map(([z, c]) => [z, Math.min(...points.map((p) => haversineMiles(p, c)))] as const)
    .filter(([, d]) => d <= miles)
    .sort((a, b) => a[1] - b[1]);
  return { zips: near.slice(0, max).map(([z]) => z), capped: near.length > max };
}

export const MAX_ZIPS = 12;
/** A typed place matched farther than this from her office, and not by its own name, is refused. */
export const FAR_MILES = 75;
export const RADII = [1, 3, 5, 10] as const;

export type Precision = "address" | "zip";

export type AreaProvider = Provider & {
  /** Null for a sensitive provider (DV/SA agency, shelter): never on the map. */
  lat: number | null;
  lon: number | null;
  /** A DV/SA agency or shelter: no street, ZIP, pin or distance; contact through their public line only. */
  sensitive?: boolean;
  /** "address": the Census geocoder found the building. "zip": placed at the ZIP's center. */
  precision: Precision;
  distanceMiles: number | null;
  /** For a person: a group in these results at the same address. */
  worksAt: string | null;
  tier: TierResult;
};

export type AreaResult = {
  label: string;
  center: Point;
  zips: string[];
  providers: AreaProvider[];
  requests: number;
  /** Plain-words notes on what was left out, if anything. */
  notes: string[];
};

/** `suppressed`: NPIs on her do-not-contact list, left out of every search; `blocked`: the whole list, with org keys (045). */
export type PracticeContext = { office: Point | null; officeZip: string | null; state: string; focus: Focus[]; suppressed?: Set<string>; blocked?: Suppressed };

/** A provider as the do-not-contact check reads it. */
export const providerKeyCard = (p: Provider) => ({
  npi: p.npi,
  name: p.npiType === "organization" ? (p.practiceName ?? p.organization ?? p.name) : p.name,
  organization: p.practiceName ?? p.organization,
  npi_type: p.npiType,
  address: p.address,
  city: p.city,
  zip: p.zip,
});

type Deps = {
  search?: typeof searchProviders;
  geocode?: typeof geocodeAddresses;
  place?: typeof geocodePlace;
  /** The chat's sensitive-info check, run on a typed place before it leaves the app. */
  check?: (text: string) => Promise<boolean>;
  centers?: Centers;
  now?: () => number;
};

/** How long a search may take before it answers with what it has (the route allows 120 s). */
export const SEARCH_MS = 90_000;

/** A known neighborhood or suburb goes straight through; anything else must pass the chat's guard. */
export async function placeAllowed(text: string, check: (text: string) => Promise<boolean> = async (t) => (await guard(t, "message")).ok): Promise<boolean> {
  return isKnownPlace(text) || check(text);
}

const checkPlace = (text: string) => placeAllowed(text);

export class AreaError extends Error {}

/** She typed the matched place's own name, as whole words ("Collinsville IL" names Collinsville; "lin" doesn't name Lincoln). */
export function namesPlace(typed: string, label: string): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);
  const name = words(label.split(",")[0]);
  const said = words(typed);
  if (name.length === 0) return false;
  for (let i = 0; i + name.length <= said.length; i++) if (name.every((w, j) => said[i + j] === w)) return true;
  return false;
}

const sameAddress = (p: Provider) => `${p.address}|${p.zip}`.toLowerCase();

/** People whose NPPES location matches a group's in the same results get "works at". */
export function linkGroups(providers: Provider[]): Map<string, string> {
  const groups = new Map<string, string>();
  for (const p of providers) if (p.npiType === "organization" && p.practiceName) groups.set(sameAddress(p), p.practiceName);
  const out = new Map<string, string>();
  for (const p of providers) {
    const g = p.npiType === "individual" ? groups.get(sameAddress(p)) : undefined;
    if (g) out.set(p.npi, g);
  }
  return out;
}

export async function searchArea(
  req: { area: Area; radiusMiles: number; specialties: SpecialtyId[] },
  ctx: PracticeContext,
  deps: Deps = {},
): Promise<AreaResult> {
  const now = deps.now ?? Date.now;
  const deadline = now() + SEARCH_MS;
  const centers = deps.centers ?? (await zipCenters());
  const notes: string[] = [];
  let label: string;
  let center: Point;
  let zips: string[];
  let postals: string[];
  let maxRequests = 150;

  const area = req.area.kind === "empty" && ctx.officeZip ? { kind: "zips" as const, zips: [ctx.officeZip] } : req.area;
  if (area.kind === "empty") throw new AreaError("Type a ZIP code, a city or a neighborhood.");
  if (req.specialties.length === 0) throw new AreaError("Pick at least one kind of provider.");
  // Never a silent default: say which ZIP an empty box searched.
  if (req.area.kind === "empty") notes.push(`You didn't type an area, so I searched around your ZIP code, ${ctx.officeZip}.`);
  const officePoint = ctx.office ?? (ctx.officeZip ? (centers[ctx.officeZip] ?? null) : null);

  if (area.kind === "chicagoland") {
    zips = chicagolandZips(centers);
    // NPPES takes "606*" for every ZIP starting 606, so a few searches cover the area.
    postals = [...new Set(zips.map((z) => `${z.slice(0, 3)}*`))];
    label = "All of Chicagoland";
    center = LOOP;
    maxRequests = 220;
  } else {
    let points: Point[];
    if (area.kind === "zips") {
      const unknown = area.zips.filter((z) => !centers[z]);
      if (unknown.length) throw new AreaError(`I don't know ZIP ${unknown.join(", ")}. Check it and try again.`);
      points = area.zips.map((z) => centers[z]);
      label = area.zips.join(", ");
    } else {
      // A typed place goes to OpenStreetMap, so it gets the same check as a chat message first.
      if (!(await (deps.check ?? checkPlace)(area.place))) {
        throw new AreaError("That looks like it could be about a person, so I didn't look it up. Try a ZIP code or a city instead.");
      }
      const hit = await (deps.place ?? geocodePlace)(area.place, ctx.state || "Illinois");
      if (!hit) throw new AreaError(`I couldn't find "${area.place}" on the map. Try a ZIP code or a nearby city.`);
      // OpenStreetMap answers something for almost any text ("abc" is a town 256 miles away).
      // A far-off match she didn't name is refused, not searched quietly.
      const miles = officePoint ? haversineMiles(officePoint, hit.point) : null;
      const sheNamedIt = namesPlace(area.place, hit.label);
      if (miles !== null && miles > FAR_MILES && !sheNamedIt) {
        throw new AreaError(
          `"${area.place}" matched ${hit.label}, about ${Math.round(miles)} miles from your office, so I didn't search there. Try a ZIP code or the name of a nearby city.`,
        );
      }
      if (miles !== null && miles > FAR_MILES) notes.push(`${hit.label} is about ${Math.round(miles)} miles from your office.`);
      const home = stateCode(ctx.state);
      if (hit.state && home && hit.state !== home) {
        notes.push(`${hit.label} is in ${stateName(hit.state)}, outside ${stateName(home)} where you practice. Check you can see clients from there before you reach out.`);
      }
      points = [hit.point];
      label = hit.label;
    }
    center = points[0];
    const near = zipsNear(centers, points, req.radiusMiles, MAX_ZIPS);
    zips = [...new Set([...(area.kind === "zips" ? area.zips : []), ...near.zips])].slice(0, MAX_ZIPS);
    if (zips.length === 0) zips = zipsNear(centers, points, 50, 1).zips;
    if (near.capped) notes.push(`That radius covers more than ${MAX_ZIPS} ZIP codes, so I searched the ${MAX_ZIPS} nearest.`);
    postals = zips;
    // A ZIP across the state line (typed, or pulled in by the radius) is searched, and said.
    const away = outOfStateWarning(zips, ctx.state);
    if (away && !notes.some((n) => n.includes(" where you practice"))) notes.push(away);
  }

  const found = await (deps.search ?? searchProviders)(req.specialties, postals, { maxRequests, deadline, now });
  if (found.timedOut) {
    notes.push(`The NPI Registry was slow, so this is showing the first ${found.timedOut.done} of ${found.timedOut.of} areas. Search again in a minute for the rest.`);
  }
  const inArea = new Set(zips);
  // Someone on her do-not-contact list never shows again (lib/referrals/contacts.ts).
  const providers = found.providers.filter((p) => inArea.has(p.zip) && !ctx.suppressed?.has(p.npi) && !(ctx.blocked && isSuppressed(providerKeyCard(p), ctx.blocked)));
  if (found.budgetCut && found.skipped?.length) {
    // Each kind is its own set of questions, so fewer kinds is what makes room.
    notes.push(
      `I ran out of NPI Registry questions before finishing ${specialtyLabels(found.skipped)}, so ${found.skipped.length === 1 ? "that kind is" : "those kinds are"} only partly shown. Pick fewer kinds and search again to see everyone.`,
    );
  } else if (found.truncated) {
    notes.push(
      area.kind === "chicagoland"
        ? "The NPI Registry gives at most 1,200 people per search, so this is part of Chicagoland. Search a ZIP code to see everyone near you."
        : "The NPI Registry gives at most 1,200 people per search, so this is part of the list. A smaller radius shows everyone.",
    );
  }

  const works = linkGroups(providers);
  // The geocoder takes a few hundred addresses at a time, so the likely best go first.
  const rough = (p: Provider) => {
    const c = centers[p.zip];
    const miles = officePoint && c ? haversineMiles(officePoint, c) : null;
    return providerTier(p, { miles, focus: ctx.focus, clinicianState: ctx.state }).score;
  };
  const byPromise = [...providers].sort((a, b) => rough(b) - rough(a));
  const located = await (deps.geocode ?? geocodeAddresses)(
    // A home-looking address is never placed at street level: it stays at the ZIP center.
    byPromise.filter((p) => !p.homeAddress && !isSensitiveSource(p)).map((p) => ({ street: p.address, city: p.city, state: p.state, zip: p.zip })),
    { timeoutMs: deadline + 25_000 - now() },
  );

  const out: AreaProvider[] = [];
  for (const p of providers) {
    // A DV/SA agency or shelter: city only. No street, ZIP, map point or distance leaves the server.
    if (isSensitiveSource(p)) {
      const tier = providerTier(p, { miles: null, focus: ctx.focus, approximate: true, clinicianState: ctx.state });
      out.push({
        ...p,
        address: "",
        zip: "",
        homeAddress: false,
        lat: null,
        lon: null,
        precision: "zip",
        distanceMiles: null,
        worksAt: null,
        sensitive: true,
        tier: { ...tier, reasons: [tier.reasons[0], ...withoutDistance(tier.reasons.slice(1))] },
      });
      continue;
    }
    const exact = p.homeAddress ? null : (located.get(addressKey({ street: p.address, city: p.city, state: p.state, zip: p.zip })) ?? null);
    const point = exact ?? centers[p.zip];
    if (!point) continue;
    const distanceMiles = officePoint ? Math.round(haversineMiles(officePoint, point) * 10) / 10 : null;
    const worksAt = works.get(p.npi) ?? null;
    out.push({
      ...p,
      lat: point[0],
      lon: point[1],
      precision: exact ? "address" : "zip",
      distanceMiles,
      worksAt,
      tier: providerTier(p, { miles: distanceMiles, focus: ctx.focus, approximate: !exact || !ctx.office, clinicianState: ctx.state }, worksAt),
    });
  }
  const order = (a: AreaProvider, b: AreaProvider) =>
    TIERS.indexOf(a.tier.tier) - TIERS.indexOf(b.tier.tier) ||
    b.tier.score - a.tier.score ||
    (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99) ||
    a.name.localeCompare(b.name);
  const ranked = capFirst(out.sort(order)).sort(order);
  if (!officePoint) notes.push("Add your office address in setup so distances are from your door.");
  return { label, center, zips, providers: ranked, requests: found.requests, notes };
}

/** Her office, state and who she helps, for distances and tiers. Business facts only. */
export async function practiceContext(sql: postgres.Sql = db()): Promise<PracticeContext> {
  const settings = await getReferralSettings(sql);
  const [profile] = await sql<{ state: string | null; who: string | null }[]>`
    select state, onboarding_answers ->> 'who_i_help' as who from practice_os.clinician_profile limit 1`.catch(() => []);
  const [loc] = await sql<{ street: string | null; city: string | null; state: string | null; zip: string | null }[]>`
    select practice_location ->> 'street' as street, practice_location ->> 'city' as city,
           practice_location ->> 'state' as state, practice_location ->> 'zip' as zip
      from practice_os.credentialing_profile limit 1`.catch(() => []);
  let office: Point | null = null;
  if (loc?.street && loc.city && loc.zip && !/sample/i.test(loc.street)) {
    const key = { street: loc.street, city: loc.city, state: loc.state ?? profile?.state ?? "", zip: loc.zip.slice(0, 5) };
    office = (await geocodeAddresses([key])).get(addressKey(key)) ?? null;
  }
  const blocked = await suppressedList(sql).catch((): Suppressed => ({ npis: new Set<string>(), orgs: [] }));
  return { office, officeZip: settings.searchZip, state: profile?.state ?? "IL", focus: focusFrom(profile?.who), suppressed: blocked.npis, blocked };
}

export function specialtyLabels(ids: SpecialtyId[]): string {
  return ids.map((id) => SPECIALTY_BY_ID.get(id)!.label).join(", ");
}
