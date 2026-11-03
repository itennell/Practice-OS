// The one-way site hashes of every sensitive card on her board (migration 045),
// so a person or place at the same street address is marked sensitive too.
// Reading them first re-flags old cards the current rules call sensitive
// (reflagSensitive), at most once per cue version every few minutes.
// No .catch: if this can't be read, saving or searching fails rather than
// putting a sensitive site's street on a card.
import type postgres from "postgres";
import { audit } from "../audit";
import { db } from "../db";
import { CUE_VERSION, isSensitiveSource, sensitiveByKind, siteHashes } from "./sensitive";

export async function knownSensitiveSites(sql: postgres.Sql = db()): Promise<Set<string>> {
  await reflagSensitiveOnce(sql);
  const rows = await sql<{ h: string }[]>`
    select unnest(site_hashes) as h from practice_os.referral_sources where sensitive and site_hashes is not null`;
  return new Set(rows.map((r) => r.h));
}

// One re-flag per database connection, cue version and 10 minutes: a chat search
// reads the sites many times, and new cards are checked when they are saved anyway.
const REFLAG_EVERY_MS = 10 * 60_000;
const lastReflag = new WeakMap<postgres.Sql, { version: number; at: number }>();

async function reflagSensitiveOnce(sql: postgres.Sql): Promise<void> {
  const last = lastReflag.get(sql);
  if (last && last.version === CUE_VERSION && Date.now() - last.at < REFLAG_EVERY_MS) return;
  await reflagSensitive(sql);
  lastReflag.set(sql, { version: CUE_VERSION, at: Date.now() });
}

type Reason = "kind" | "name" | "site";

/**
 * The app's own backfill (migration 045 did the first one in SQL): every card the
 * current rules call sensitive but saved before those rules is marked sensitive now
 * and loses its street, ZIP, distance and address evidence; each one is written to
 * audit_log with why. It only ever makes a card safer. Reasons:
 *   - kind: a DV/SA agency or shelter type, or a sensitive NUCC code;
 *   - name: a name cue (sensitive.ts);
 *   - site: at the street of a card that is sensitive by kind.
 * Only kind-sensitive cards spread to others at their street, and only they keep
 * site hashes from here: a name cue can be a false flag, and a false flag must
 * not hide a whole building. Returns how many cards changed.
 */
export async function reflagSensitive(sql: postgres.Sql = db()): Promise<number> {
  const open = await sql<{ id: string; name: string; organization: string | null; source_type: string | null; taxonomy: string | null; address: string | null; zip: string | null }[]>`
    select id, name, organization, source_type, taxonomy, address, zip from practice_os.referral_sources where not sensitive`;
  if (open.length === 0) return 0;
  const kindRows = await sql<{ source_type: string | null; taxonomy: string | null; site_hashes: string[] }[]>`
    select source_type, taxonomy, site_hashes from practice_os.referral_sources where sensitive and site_hashes is not null`;
  const sites = new Set(kindRows.filter((r) => sensitiveByKind(r)).flatMap((r) => r.site_hashes));
  const reasons = new Map<string, Reason>();
  for (const r of open) {
    if (sensitiveByKind({ type: r.source_type, taxonomy: r.taxonomy })) {
      reasons.set(r.id, "kind");
      for (const h of siteHashes(r.address, r.zip)) sites.add(h);
    } else if (isSensitiveSource({ name: r.name, organization: r.organization })) {
      reasons.set(r.id, "name");
    }
  }
  for (const r of open) if (!reasons.has(r.id) && siteHashes(r.address, r.zip).some((h) => sites.has(h))) reasons.set(r.id, "site");
  let changed = 0;
  for (const r of open) {
    const reason = reasons.get(r.id);
    if (!reason) continue;
    const hashes = reason === "kind" ? siteHashes(r.address, r.zip) : [];
    const done = await sql.begin(async (tx) => {
      const rows = await tx`
        update practice_os.referral_sources
           set sensitive = true, site_hashes = ${hashes.length ? hashes : null}, address = null, zip = null, distance_miles = null, updated_at = now()
         where id = ${r.id} and not sensitive
        returning id`;
      if (rows.length === 0) return false;
      await tx`delete from practice_os.referral_facts where source_id = ${r.id} and field = 'address'`;
      return true;
    });
    if (!done) continue;
    changed++;
    await audit({ actor: "system", action: "referral_reflagged_sensitive", subjectType: "referral_source", subjectId: r.id, details: { reason, cue_version: CUE_VERSION } }, sql);
  }
  return changed;
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
