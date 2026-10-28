// ZIP code centers for distance, from the US Census 2020 ZCTA Gazetteer
// (2020_Gaz_zcta_national.txt, public domain): every ZIP code tabulation area in
// every state, as { zip: [lat, lon] } rounded to 3 decimals (about 100 m).
// About 800 KB, so it loads on first use, not with the app.

type Centers = Record<string, [number, number]>;
let centers: Promise<Centers> | null = null;

export function zipCenters(): Promise<Centers> {
  centers ??= import("./zcta-centers.json").then((m) => (m.default ?? m) as unknown as Centers);
  return centers;
}

const EARTH_MILES = 3958.8;

/** Great-circle distance in miles. */
export function haversineMiles(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
}

/** Miles between two ZIP centers, to one decimal; null when either ZIP is unknown. */
export function zipDistance(all: Centers, from: string, to: string): number | null {
  const a = all[from];
  const b = all[to];
  if (!a || !b) return null;
  return Math.round(haversineMiles(a, b) * 10) / 10;
}

/** The ZIP itself, then the nearest others within `miles`, at most `max` in all. */
export function nearbyZips(all: Centers, zip: string, miles: number, max: number): string[] {
  const home = all[zip];
  if (!home) return [];
  return Object.entries(all)
    .filter(([z, c]) => z !== zip && Math.abs(c[0] - home[0]) < 0.5 && Math.abs(c[1] - home[1]) < 0.7)
    .map(([z, c]) => [z, haversineMiles(home, c)] as const)
    .filter(([, d]) => d <= miles)
    .sort((x, y) => x[1] - y[1])
    .slice(0, Math.max(0, max - 1))
    .reduce<string[]>((list, [z]) => [...list, z], [zip]);
}
