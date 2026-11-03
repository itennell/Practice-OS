// The one-way site hashes of every sensitive card on her board (migration 045),
// so a person or place at the same street address is marked sensitive too.
// Reading them first re-flags old cards the current rules call sensitive (reflagSensitive).
// No .catch: if this can't be read, saving or searching fails rather than
// putting a sensitive site's street on a card.
import type postgres from "postgres";
import { db } from "../db";
import { isSensitiveSource, siteHashes } from "./sensitive";

export async function knownSensitiveSites(sql: postgres.Sql = db()): Promise<Set<string>> {
  await reflagSensitive(sql);
  const rows = await sql<{ h: string }[]>`
    select unnest(site_hashes) as h from practice_os.referral_sources where sensitive and site_hashes is not null`;
  return new Set(rows.map((r) => r.h));
}

/**
 * The app's own backfill (migration 045 did the first one in SQL): every card the
 * current rules call sensitive (by kind, NUCC code or name cue in sensitive.ts, or
 * at the street of a sensitive card) but saved before those rules, is marked
 * sensitive now and loses its street, ZIP, distance and address evidence. It only
 * ever makes a card safer. Runs before every discovery and save
 * (knownSensitiveSites), so an old card is fixed on the next search. Returns how many.
 */
export async function reflagSensitive(sql: postgres.Sql = db()): Promise<number> {
  const open = await sql<{ id: string; name: string; organization: string | null; source_type: string | null; taxonomy: string | null; address: string | null; zip: string | null }[]>`
    select id, name, organization, source_type, taxonomy, address, zip from practice_os.referral_sources where not sensitive`;
  if (open.length === 0) return 0;
  const sites = new Set(
    (await sql<{ h: string }[]>`select unnest(site_hashes) as h from practice_os.referral_sources where sensitive and site_hashes is not null`).map((r) => r.h),
  );
  const byName = open.filter((r) => isSensitiveSource({ type: r.source_type, taxonomy: r.taxonomy, name: r.name, organization: r.organization }));
  for (const r of byName) for (const h of siteHashes(r.address, r.zip)) sites.add(h);
  const named = new Set(byName.map((r) => r.id));
  const hits = open.filter((r) => named.has(r.id) || siteHashes(r.address, r.zip).some((h) => sites.has(h)));
  for (const r of hits) {
    const hashes = siteHashes(r.address, r.zip);
    await sql.begin(async (tx) => {
      await tx`
        update practice_os.referral_sources
           set sensitive = true, site_hashes = ${hashes.length ? hashes : null}, address = null, zip = null, distance_miles = null, updated_at = now()
         where id = ${r.id} and not sensitive`;
      await tx`delete from practice_os.referral_facts where source_id = ${r.id} and field = 'address'`;
    });
  }
  return hits.length;
}

/** Sensitive by kind or name, or because its street address is a known sensitive site. */
export function sensitiveAt(
  c: { type?: string | null; taxonomy?: string | null; name?: string | null; organization?: string | null; street?: string | null; zip?: string | null },
  sites: Set<string>,
): { sensitive: boolean; hashes: string[] } {
  const hashes = siteHashes(c.street, c.zip);
  const sensitive = isSensitiveSource(c) || hashes.some((h) => sites.has(h));
  return { sensitive, hashes };
}
