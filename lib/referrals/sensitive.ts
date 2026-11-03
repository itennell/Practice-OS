// Sensitive referral sources (the catalog's DV/SA agencies and shelters,
// lib/referrals/catalog.ts isSensitive): never a map pin or a street address,
// on the board, the map or its list. Only the city and "public contact only".
// Small and browser-safe: the board and the area explorer both use it.

export const PUBLIC_CONTACT_ONLY = "public contact only";

/** What a sensitive card shows where others show a street address. */
export function sensitiveLocation(city: string | null | undefined): string {
  return [city?.trim() || null, PUBLIC_CONTACT_ONLY].filter(Boolean).join(" · ");
}

/** The people that get a pin on the map: everyone but sensitive kinds. */
export function pinnable<T extends { tier: { sensitive?: boolean } }>(people: T[]): T[] {
  return people.filter((p) => !p.tier.sensitive);
}

/** A provider as it may leave the server: a sensitive one loses its street address and exact point. */
export function withoutStreet<T extends { tier: { sensitive?: boolean }; address: string | null; precision?: "address" | "zip" }>(p: T): T {
  return p.tier.sensitive ? { ...p, address: null, ...(p.precision ? { precision: "zip" as const } : {}) } : p;
}
