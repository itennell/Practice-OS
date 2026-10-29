// Putting providers on the map without a paid key. Two free public services:
//   - US Census Geocoder (geocoding.geo.census.gov), batch of street addresses,
//     no key, public domain: a pin at the building.
//   - OpenStreetMap Nominatim, for a typed city or neighborhood ("Lincoln Park"),
//     no key, at most one question a second with a named User-Agent (its usage
//     policy, operations.osmfoundation.org/policies/nominatim).
// Only provider addresses from NPPES and the place she typed are sent. Never
// anything about a client. Answers are kept in memory so each address is asked once.

export type Point = [lat: number, lon: number];

const CENSUS_BATCH = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Practice-OS/0.1 (self-hosted practice app; github.com/itennell/Practice-OS)";

export type Address = { street: string; city: string; state: string; zip: string };

export function addressKey(a: Address): string {
  return `${a.street}|${a.city}|${a.state}|${a.zip}`.toLowerCase().replace(/\s+/g, " ").trim();
}

const points = new Map<string, Point | null>();

function csvCell(v: string): string {
  return `"${v.replace(/"/g, "'")}"`;
}

/** One reply line from the Census batch: "id","input","Match","Exact","matched","lon,lat",... */
export function parseCensusLine(line: string): { id: string; point: Point | null } | null {
  const cells = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  if (cells.length < 3) return null;
  const id = cells[0];
  if (cells[2] !== "Match" || !cells[5]) return { id, point: null };
  const [lon, lat] = cells[5].split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { id, point: [lat, lon] } : { id, point: null };
}

type Post = (body: FormData) => Promise<string>;

const censusPost: Post = async (body) => {
  const res = await fetch(CENSUS_BATCH, { method: "POST", body, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`The Census geocoder answered ${res.status}.`);
  return res.text();
};

/**
 * Street addresses to points. Unknown or failed ones come back null, and the
 * caller falls back to the ZIP center. At most `max` new addresses per call
 * (the batch takes about a second per hundred).
 */
export async function geocodeAddresses(addresses: Address[], opts: { post?: Post; max?: number } = {}): Promise<Map<string, Point | null>> {
  const out = new Map<string, Point | null>();
  const todo: Address[] = [];
  for (const a of addresses) {
    const key = addressKey(a);
    if (points.has(key)) out.set(key, points.get(key)!);
    else if (!todo.some((t) => addressKey(t) === key)) todo.push(a);
  }
  const batch = todo.slice(0, opts.max ?? 1500);
  if (batch.length === 0) return out;
  const csv = batch.map((a, i) => [String(i), a.street, a.city, a.state, a.zip].map(csvCell).join(",")).join("\n");
  const form = new FormData();
  form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
  form.append("benchmark", "Public_AR_Current");
  try {
    const text = await (opts.post ?? censusPost)(form);
    const found = new Map<string, Point | null>();
    for (const line of text.split(/\r?\n/)) {
      const row = parseCensusLine(line);
      if (row) found.set(row.id, row.point);
    }
    batch.forEach((a, i) => {
      const key = addressKey(a);
      const point = found.get(String(i)) ?? null;
      points.set(key, point);
      out.set(key, point);
    });
  } catch (err) {
    // The map still works on ZIP centers; say so in the log, not to her.
    console.error(`[referrals] Census geocoder: ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}

const places = new Map<string, { point: Point; label: string } | null>();
let lastPlaceAt = 0;

type Get = (url: string) => Promise<{ lat: string; lon: string; display_name: string }[]>;

const nominatimGet: Get = async (url) => {
  const wait = lastPlaceAt + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastPlaceAt = Date.now();
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`OpenStreetMap answered ${res.status}.`);
  return res.json();
};

/** A typed city or neighborhood, in her state, to its center. Null when OpenStreetMap doesn't know it. */
export async function geocodePlace(place: string, state: string, get: Get = nominatimGet): Promise<{ point: Point; label: string } | null> {
  const q = `${place.trim()}, ${state}`;
  const key = q.toLowerCase();
  if (places.has(key)) return places.get(key)!;
  const url = `${NOMINATIM}?${new URLSearchParams({ q, countrycodes: "us", format: "jsonv2", limit: "1" })}`;
  const [hit] = await get(url);
  const found = hit ? { point: [Number(hit.lat), Number(hit.lon)] as Point, label: hit.display_name.split(",").slice(0, 2).join(",").trim() } : null;
  places.set(key, found);
  return found;
}

export function clearGeocodeCache() {
  points.clear();
  places.clear();
}
