// The one-way site hashes of every sensitive card on her board (migration 045),
// so a person or place at the same street address is marked sensitive too.
// No .catch: if this can't be read, saving or searching fails rather than
// putting a sensitive site's street on a card.
import type postgres from "postgres";
import { db } from "../db";
import { isSensitiveSource, siteHashes } from "./sensitive";

export async function knownSensitiveSites(sql: postgres.Sql = db()): Promise<Set<string>> {
  const rows = await sql<{ h: string }[]>`
    select unnest(site_hashes) as h from practice_os.referral_sources where sensitive and site_hashes is not null`;
  return new Set(rows.map((r) => r.h));
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
