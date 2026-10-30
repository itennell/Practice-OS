// referral_sources: the Referrals board's cards. A search adds or refreshes
// cards by NPI but never touches the stage, notes or follow-up date she set.
import type postgres from "postgres";
import { forgetAllowlist } from "../aeon/guard";
import { audit } from "../audit";
import { practiceToday } from "../compliance/store";
import { db } from "../db";
import { nearbyZips, zipCenters, zipDistance } from "./geo";
import { fetchProviders, looksResidential, providerByNpi, SPECIALTY_BY_ID, type Provider, type SpecialtyId } from "./nppes";
import { suppressedNpis } from "./contacts";
import { nppesFacts, saveFacts } from "./evidence/store";
import { focusFrom, providerTier, SCORE_VERSION, tierFor, type Focus } from "./tier";
import { STAGES, STAGE_LABEL, type Stage } from "./stages";

export { STAGES, STAGE_LABEL, type Stage };

export type ReferralSource = {
  id: string;
  npi: string | null;
  name: string;
  organization: string | null;
  taxonomy: string | null;
  specialty: string | null;
  npi_type: "individual" | "organization" | null;
  credential: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  stage: Stage;
  distance_miles: number | null;
  fit_score: number | null;
  score_version: number | null;
  last_contacted_at: string | null;
  next_follow_up_on: string | null;
  notes: string | null;
  is_sample: boolean;
  website?: string | null;
  introduced_by?: string | null;
  confidence?: "confirmed" | "partly" | "unconfirmed" | null;
};

export type FoundSource = Provider & { distanceMiles: number | null; fitScore: number; id?: string };

/** Searches NPPES around a ZIP, scores each provider and saves them. Best fit first. */
export async function findReferralSources(
  opts: { zip: string; specialties: SpecialtyId[]; radiusMiles?: number; perSpecialty?: number; fetcher?: Parameters<typeof fetchProviders>[2] },
  sql: postgres.Sql = db(),
): Promise<{ zips: string[]; found: FoundSource[]; matched: number; saved: number }> {
  const centers = await zipCenters();
  if (!centers[opts.zip]) throw new Error(`I don't know ZIP ${opts.zip}. Check it and try again.`);
  const zips = nearbyZips(centers, opts.zip, opts.radiusMiles ?? 3, 5);
  const blocked = await suppressedNpis(sql);
  const providers = (await fetchProviders(opts.specialties, zips, opts.fetcher)).filter((p) => !blocked.has(p.npi));
  const { focus, state } = await practiceFacts(sql);
  const scored = providers
    .map((p) => {
      const distanceMiles = zipDistance(centers, opts.zip, p.zip);
      return { ...p, distanceMiles, fitScore: providerTier(p, { miles: distanceMiles, focus, clinicianState: state }).score };
    })
    .sort((a, b) => b.fitScore - a.fitScore || (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99) || a.name.localeCompare(b.name));
  // A city ZIP has thousands; the board keeps the best few of each kind.
  const perKind = opts.perSpecialty ?? PER_SPECIALTY;
  const found = opts.specialties.flatMap((s) => scored.filter((p) => p.specialty === s).slice(0, perKind));
  const saved = await saveSources(found, sql);
  await audit(
    { actor: "aeon", action: "referral_sources_found", subjectType: "referral_sources", details: { zip: opts.zip, zips, specialties: opts.specialties, matched: scored.length, saved } },
    sql,
  );
  return { zips, found, matched: scored.length, saved };
}

const PER_SPECIALTY = 20;

/** Who she helps (onboarding), as the groups the tiers match on, and her state. */
export async function practiceFacts(sql: postgres.Sql = db()): Promise<{ focus: Focus[]; state: string | null }> {
  const [row] = await sql<{ who: string | null; state: string | null }[]>`
    select onboarding_answers ->> 'who_i_help' as who, state from practice_os.clinician_profile limit 1`.catch(() => []);
  return { focus: focusFrom(row?.who), state: row?.state ?? null };
}

/**
 * "Add to board" on the map's list: each NPI is looked up again in NPPES (so
 * the board holds the registry's words, not whatever the page sent) and saved
 * under Found with its distance and tier score.
 */
export async function addToBoard(
  items: { npi: string; distanceMiles: number | null }[],
  sql: postgres.Sql = db(),
  lookup: (npi: string) => Promise<Provider | null> = (npi) => providerByNpi(npi),
): Promise<{ added: FoundSource[]; missing: string[] }> {
  const { focus, state } = await practiceFacts(sql);
  const blocked = await suppressedNpis(sql);
  const added: FoundSource[] = [];
  const missing: string[] = [];
  // Each one is saved as soon as NPPES answers for it, so one slow lookup doesn't lose the rest.
  for (const npi of new Set(items.map((i) => i.npi))) {
    if (blocked.has(npi)) {
      missing.push(npi);
      continue;
    }
    const item = items.find((i) => i.npi === npi)!;
    const p = await lookup(npi).catch(() => null);
    if (!p) {
      missing.push(npi);
      continue;
    }
    const miles = item.distanceMiles === null || !Number.isFinite(item.distanceMiles) ? null : Math.max(0, Math.min(500, item.distanceMiles));
    const one: FoundSource = { ...p, distanceMiles: miles, fitScore: providerTier(p, { miles, focus, clinicianState: state }).score };
    await saveSources([one], sql);
    added.push(one);
  }
  await audit(
    { actor: "clinician", action: "referral_sources_added", subjectType: "referral_sources", details: { npis: added.map((a) => a.npi), missing } },
    sql,
  );
  return { added, missing };
}

/** The best of each kind in turn, so "primary care and oncology" shows both. */
export function interleave(found: FoundSource[], count: number): FoundSource[] {
  const groups = [...new Set(found.map((p) => p.specialty))].map((s) => found.filter((p) => p.specialty === s));
  const out: FoundSource[] = [];
  for (let i = 0; out.length < count && groups.some((g) => g[i]); i++) {
    for (const g of groups) if (g[i] && out.length < count) out.push(g[i]);
  }
  return out;
}

export async function saveSources(found: FoundSource[], sql: postgres.Sql = db()): Promise<number> {
  if (found.length === 0) return 0;
  const rows = found.map((p) => ({
    npi: p.npi,
    name: p.name,
    organization: p.organization,
    taxonomy: p.taxonomy,
    specialty: p.specialtyLabel,
    npi_type: p.npiType,
    credential: p.credential,
    address: p.address,
    city: p.city,
    state: p.state,
    zip: p.zip,
    phone: p.phone,
    distance_miles: p.distanceMiles,
    fit_score: p.fitScore,
    score_version: SCORE_VERSION,
  }));
  const result = await sql`
    insert into practice_os.referral_sources ${sql(rows)}
    on conflict (npi) do update set
      name = excluded.name, organization = excluded.organization, taxonomy = excluded.taxonomy,
      specialty = excluded.specialty, npi_type = excluded.npi_type, credential = excluded.credential,
      address = excluded.address, city = excluded.city, state = excluded.state, zip = excluded.zip,
      phone = excluded.phone, distance_miles = excluded.distance_miles, fit_score = excluded.fit_score,
      score_version = excluded.score_version,
      updated_at = now()
    returning id, npi`;
  const ids = new Map(result.map((r) => [r.npi as string, r.id as string]));
  for (const p of found) p.id = ids.get(p.npi);
  // The registry's answer is the card's first piece of evidence (lib/referrals/evidence).
  const checkedAt = new Date().toISOString();
  for (const p of found) if (p.id) await saveFacts(p.id, nppesFacts(p, checkedAt), { checked: ["nppes"], sql });
  // The privacy guard lets her Referrals names through; let it see the new ones now.
  forgetAllowlist();
  return result.count;
}

/**
 * Cards scored by an older formula get today's score: from NPPES by NPI when
 * the card has one (the full record: fax, named contact, record age), else from
 * what the card keeps. A few at a time, after the page is sent.
 */
export async function rescoreOldCards(
  sql: postgres.Sql = db(),
  lookup: (npi: string) => Promise<Provider | null> = (npi) => providerByNpi(npi),
  max = 25,
): Promise<number> {
  const rows = await sql<
    { id: string; npi: string | null; taxonomy: string | null; npi_type: "individual" | "organization" | null; phone: string | null; state: string | null; address: string | null; distance_miles: number | null }[]
  >`
    select id, npi, taxonomy, npi_type, phone, state, address, distance_miles::float8 as distance_miles
      from practice_os.referral_sources where score_version <> ${SCORE_VERSION} limit ${max}`;
  if (rows.length === 0) return 0;
  const { focus, state } = await practiceFacts(sql);
  for (const row of rows) {
    const ctx = { miles: row.distance_miles, focus, clinicianState: state };
    const p = row.npi ? await lookup(row.npi).catch(() => null) : null;
    const score = p
      ? providerTier(p, ctx).score
      : tierFor(
          { taxonomy: row.taxonomy, npiType: row.npi_type, phone: row.phone, state: row.state, homeAddress: row.npi_type !== "organization" && looksResidential(row.address) },
          ctx,
        ).score;
    await sql`update practice_os.referral_sources set fit_score = ${score}, score_version = ${SCORE_VERSION} where id = ${row.id}`;
  }
  return rows.length;
}

/**
 * Contacted cards whose follow-up day has come move to Follow up, with an
 * audit row each. A write: only for her own computer's page loads and other
 * write paths. Reads show the same column without writing (`listSources`).
 */
export async function moveDueFollowUps(sql: postgres.Sql = db()): Promise<number> {
  const today = await practiceToday(sql);
  const moved = await sql<{ id: string }[]>`
    update practice_os.referral_sources set stage = 'follow_up', updated_at = now()
     where stage = 'contacted' and next_follow_up_on <= ${today}
    returning id`;
  for (const { id } of moved) {
    await audit({ actor: "system", action: "referral_follow_up_due", subjectType: "referral_source", subjectId: id }, sql);
  }
  return moved.length;
}

// The column as she should see it: a Contacted card whose follow-up day has
// come reads as Follow up, computed here so reading the board never writes
// (the view-only copy can read it too). `$1` is today in her time zone.
const COLUMNS = `id, npi, name, organization, taxonomy, specialty, npi_type, credential, address, city, state, zip,
  phone, email,
  case when stage = 'contacted' and next_follow_up_on <= $1::date then 'follow_up' else stage end as stage,
  distance_miles::float8 as distance_miles, fit_score, score_version, last_contacted_at, next_follow_up_on::text as next_follow_up_on,
  notes, is_sample, website, introduced_by, confidence`;

/** Every card, best fit first. Read-only: due follow-ups show as Follow up without being moved. */
export async function listSources(sql: postgres.Sql = db()): Promise<ReferralSource[]> {
  const today = await practiceToday(sql);
  return sql.unsafe<ReferralSource[]>(
    `select ${COLUMNS} from practice_os.referral_sources
      order by fit_score desc nulls last, distance_miles nulls last, name`,
    [today],
  );
}

export async function getSource(id: string, sql: postgres.Sql = db()): Promise<ReferralSource | null> {
  const today = await practiceToday(sql);
  const [row] = await sql.unsafe<ReferralSource[]>(`select ${COLUMNS} from practice_os.referral_sources where id = $2`, [today, id]);
  return row ?? null;
}

/** Moves a card to another column. Returns the card, or null when there is no such card. */
export async function moveSource(id: string, stage: Stage, by: "clinician" | "aeon", sql: postgres.Sql = db()) {
  const before = await getSource(id, sql);
  if (!before) return null;
  if (before.stage === stage) return before;
  await sql`update practice_os.referral_sources set stage = ${stage}, updated_at = now() where id = ${id}`;
  await audit(
    { actor: by, action: "referral_stage_moved", subjectType: "referral_source", subjectId: id, details: { from: before.stage, to: stage } },
    sql,
  );
  return { ...before, stage };
}

/** The approved letter's bookkeeping: card to Contacted, follow-up a week out. */
export async function markContacted(id: string, followUpDays: number, sql: postgres.Sql = db()): Promise<string> {
  const today = await practiceToday(sql);
  const [row] = await sql<{ next_follow_up_on: string }[]>`
    update practice_os.referral_sources
       set stage = 'contacted', last_contacted_at = now(),
           next_follow_up_on = ${today}::date + ${followUpDays}::int, updated_at = now()
     where id = ${id}
    returning next_follow_up_on::text as next_follow_up_on`;
  if (!row) throw new Error("That referral source is no longer on the board.");
  return row.next_follow_up_on;
}

export function specialtyLabel(id: SpecialtyId): string {
  return SPECIALTY_BY_ID.get(id)!.label;
}

export type LetterState = { approvalId: string; status: string; subject: string | null; letter: string | null };

/** The latest introduction letter for each card, so the board can say where it stands. */
export async function latestLetters(sql: postgres.Sql = db()): Promise<Record<string, LetterState>> {
  // An edit made while approving is in the result; otherwise the letter as Muse wrote it.
  const rows = await sql<{ source_id: string; id: string; status: string; subject: string | null; letter: string | null }[]>`
    select distinct on (payload ->> 'referral_source_id')
           payload ->> 'referral_source_id' as source_id, id, status,
           coalesce(result #>> '{letter,subject}', payload ->> 'subject') as subject,
           coalesce(result #>> '{letter,body}', payload ->> 'letter') as letter
      from practice_os.approvals
     where kind = 'referral_letter' and payload ? 'referral_source_id'
     order by payload ->> 'referral_source_id', created_at desc`;
  return Object.fromEntries(rows.map((r) => [r.source_id, { approvalId: r.id, status: r.status, subject: r.subject, letter: r.letter }]));
}
