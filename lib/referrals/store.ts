// referral_sources: the Referrals board's cards. A search adds or refreshes
// cards by NPI but never touches the stage, notes or follow-up date she set.
import type postgres from "postgres";
import { forgetAllowlist } from "../aeon/guard";
import { audit } from "../audit";
import { practiceToday } from "../compliance/store";
import { db } from "../db";
import { nearbyZips, zipCenters, zipDistance } from "./geo";
import { fetchProviders, looksResidential, providerByNpi, SPECIALTY_BY_ID, type Provider, type SpecialtyId } from "./nppes";
import { isSuppressed, suppressedList } from "./contacts";
import { providerKeyCard } from "./dnc-key";
import { nppesFacts, saveFacts } from "./evidence/store";
import { compareTiers, focusFrom, providerTier, SCORE_VERSION, scoreVersionFor, selfPayFrom, tierFor, type Focus } from "./tier";
import { isNichePreset } from "./catalog";
import { STAGES, STAGE_LABEL, type Stage } from "./stages";
import { knownSensitiveSites, sensitiveAt } from "./sensitive-sites";
import { sensitiveByKind, siteHashes } from "./sensitive";

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
  /** The catalog type (docs/research/referral-sources.json) for cards found by CMS, OpenStreetMap or added by her (migration 045). */
  source_type?: string | null;
  /** How the card was found; "manual" cards show "Added by you". */
  found_via?: "nppes" | "cms_provider_data" | "osm" | "manual" | null;
  ccn?: string | null;
  osm_ref?: string | null;
  /** A DV/SA agency or shelter: no street address, no map pin, contact through their public line only. */
  sensitive?: boolean;
} & Partial<PartnerProfile> & {
  /** A card Aeon suggested from a debrief with this partner: labelled, never contacted on its own (migration 044). */
  suggested_from?: string | null;
};

/** What she learned over coffee and confirmed (lib/referrals/debrief.ts, migration 044). Practice-business facts only. */
export type PartnerProfile = {
  refers_via: "fax" | "portal" | "email" | "phone" | null;
  referral_contact: string | null;
  populations: string[] | null;
  needs_from_therapist: string | null;
  waitlist: boolean | null;
  payer_mix: string | null;
  best_time: string | null;
  last_meeting_summary: string | null;
  connection_points: string | null;
};

export type FoundSource = Provider & {
  /** The map search marked it sensitive (a person at a sensitive site): only ever makes it safer. */
  forceSensitive?: boolean;
  distanceMiles: number | null;
  fitScore: number;
  id?: string;
  /** The score_version for the niche this score was weighted for (tier.ts scoreVersionFor). */
  scoreVersion?: number;
};

/** Searches NPPES around a ZIP, scores each provider and saves them. Best fit first. */
export async function findReferralSources(
  opts: { zip: string; specialties: SpecialtyId[]; radiusMiles?: number; perSpecialty?: number; fetcher?: Parameters<typeof fetchProviders>[2] },
  sql: postgres.Sql = db(),
): Promise<{ zips: string[]; found: FoundSource[]; matched: number; saved: number }> {
  const centers = await zipCenters();
  if (!centers[opts.zip]) throw new Error(`I don't know ZIP ${opts.zip}. Check it and try again.`);
  const zips = nearbyZips(centers, opts.zip, opts.radiusMiles ?? 3, 5);
  // Her do-not-contact list, by NPI and by org key (a group she listed from a card with no NPI).
  const blocked = await suppressedList(sql);
  const providers = (await fetchProviders(opts.specialties, zips, opts.fetcher)).filter((p) => !isSuppressed(providerKeyCard(p), blocked));
  const facts = await practiceFacts(sql);
  const scoreVersion = scoreVersionFor(facts.niche);
  // The same order as everywhere else (tier.ts compareTiers), before each kind's best few are kept.
  const ranked = providers
    .map((p) => {
      const distanceMiles = zipDistance(centers, opts.zip, p.zip);
      return { p, miles: distanceMiles, tier: providerTier(p, { miles: distanceMiles, ...tierContext(facts) }) };
    })
    .sort((a, b) => compareTiers(a, b) || a.p.name.localeCompare(b.p.name));
  const scored: FoundSource[] = ranked.map(({ p, miles, tier }) => ({ ...p, distanceMiles: miles, fitScore: tier.score, scoreVersion }));
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

export type PracticeFacts = {
  focus: Focus[];
  state: string | null;
  /** Her niche preset (Settings › Referrals), checked against the catalog. */
  niche: string | null;
  /** Her clients pay her themselves: no in-network payer, a fee schedule or a self-pay answer (tier.ts selfPayFrom). */
  selfPay: boolean;
};

/** Her niche preset as saved, checked against the catalog. Its own query: a database without migration 043 still works. */
export async function currentNiche(sql: postgres.Sql = db()): Promise<string | null> {
  const [setting] = await sql<{ niche: string | null }[]>`select niche_preset as niche from practice_os.referral_settings where id`.catch(() => []);
  return setting?.niche && isNichePreset(setting.niche) ? setting.niche : null;
}

/** Who she helps (onboarding), as the groups the tiers match on, her state, her niche and whether she is self-pay. */
export async function practiceFacts(sql: postgres.Sql = db()): Promise<PracticeFacts> {
  const [row] = await sql<{ who: string | null; state: string | null; insurance: string | null; fees: number | null }[]>`
    select onboarding_answers ->> 'who_i_help' as who, state, onboarding_answers ->> 'insurance' as insurance,
           case when jsonb_typeof(fee_schedule) = 'array' then jsonb_array_length(fee_schedule) else 0 end as fees
      from practice_os.clinician_profile limit 1`.catch(() => []);
  // Her real payer panels (Insurance): any approved application means she is in network.
  const [payers] = await sql<{ n: number }[]>`
    select count(*)::int as n from practice_os.payer_applications where status = 'approved'`.catch(() => [{ n: 0 }]);
  const niche = await currentNiche(sql);
  const selfPay = selfPayFrom({ inNetwork: payers?.n ?? 0, insurance: row?.insurance, hasFees: (row?.fees ?? 0) > 0 });
  return { focus: focusFrom(row?.who), state: row?.state ?? null, niche, selfPay };
}

/** The tier context from her practice facts (everything but the distance). */
export function tierContext(f: Pick<PracticeFacts, "focus" | "state" | "niche" | "selfPay">) {
  return { focus: f.focus, clinicianState: f.state, niche: f.niche, selfPay: f.selfPay };
}

/**
 * "Add to board" on the map's list: each NPI is looked up again in NPPES (so
 * the board holds the registry's words, not whatever the page sent) and saved
 * under Found with its distance and tier score.
 */
export async function addToBoard(
  items: { npi: string; distanceMiles: number | null; sensitive?: boolean }[],
  sql: postgres.Sql = db(),
  lookup: (npi: string) => Promise<Provider | null> = (npi) => providerByNpi(npi),
): Promise<{ added: FoundSource[]; missing: string[] }> {
  const { focus, state, niche, selfPay } = await practiceFacts(sql);
  const blocked = await suppressedList(sql);
  const added: FoundSource[] = [];
  const missing: string[] = [];
  // Each one is saved as soon as NPPES answers for it, so one slow lookup doesn't lose the rest.
  for (const npi of new Set(items.map((i) => i.npi))) {
    if (blocked.npis.has(npi)) {
      missing.push(npi);
      continue;
    }
    const item = items.find((i) => i.npi === npi)!;
    const p = await lookup(npi).catch(() => null);
    if (!p || isSuppressed(providerKeyCard(p), blocked)) {
      missing.push(npi);
      continue;
    }
    const sent = item.distanceMiles === null || !Number.isFinite(item.distanceMiles) ? null : Math.max(0, Math.min(500, item.distanceMiles));
    // Added again without a distance: keep (and score with) the one the card already has.
    const miles = sent ?? (await knownMiles(npi, sql));
    const one: FoundSource = { ...p, forceSensitive: item.sensitive === true, distanceMiles: miles, fitScore: providerTier(p, { miles, focus, clinicianState: state, niche, selfPay }).score, scoreVersion: scoreVersionFor(niche) };
    await saveSources([one], sql);
    added.push(one);
  }
  await audit(
    { actor: "clinician", action: "referral_sources_added", subjectType: "referral_sources", details: { npis: added.map((a) => a.npi), missing } },
    sql,
  );
  return { added, missing };
}

async function knownMiles(npi: string, sql: postgres.Sql): Promise<number | null> {
  const [row] = await sql<{ miles: number | null }[]>`
    select distance_miles::float8 as miles from practice_os.referral_sources where npi = ${npi}`;
  return row?.miles ?? null;
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
  // A score weighted for a niche she has since changed is not saved as current: a new card
  // gets version 0 (scored again), a card she has keeps its score (rescoreOldCards fixes it).
  const current = scoreVersionFor(await currentNiche(sql));
  // A DV/SA agency or shelter (by NUCC code or name cue, lib/referrals/sensitive.ts) keeps its city only,
  // and so does anyone NPPES lists at a sensitive site's street: one already on the board, or in this batch.
  const sites = await knownSensitiveSites(sql);
  for (const p of found) {
    // Only a sensitive kind (NUCC code) spreads to others at its street, never a name cue.
    if (sensitiveByKind({ taxonomy: p.taxonomy })) for (const h of siteHashes(p.address, p.zip)) sites.add(h);
  }
  const rows = found.map((p) => {
    const at = sensitiveAt({ taxonomy: p.taxonomy, name: p.name, organization: p.organization, street: p.address, zip: p.zip }, sites);
    const sensitive = at.sensitive || Boolean(p.forceSensitive);
    return {
    npi: p.npi,
    name: p.name,
    organization: p.organization,
    taxonomy: p.taxonomy,
    specialty: p.specialtyLabel,
    npi_type: p.npiType,
    credential: p.credential,
    address: sensitive ? null : p.address,
    city: p.city,
    state: p.state,
    zip: sensitive ? null : p.zip,
    phone: p.phone,
    sensitive,
    site_hashes: sensitive && sensitiveByKind({ taxonomy: p.taxonomy }) && at.hashes.length ? at.hashes : null,
    distance_miles: sensitive ? null : p.distanceMiles,
    fit_score: p.fitScore,
    score_version: (p.scoreVersion ?? SCORE_VERSION) === current ? current : 0,
    };
  });
  const result = await sql`
    insert into practice_os.referral_sources ${sql(rows)}
    on conflict (npi) do update set
      name = excluded.name, organization = excluded.organization, taxonomy = excluded.taxonomy,
      specialty = excluded.specialty, npi_type = excluded.npi_type, credential = excluded.credential,
      address = case when excluded.sensitive or referral_sources.sensitive then null else excluded.address end, city = excluded.city, state = excluded.state,
      zip = case when excluded.sensitive or referral_sources.sensitive then null else excluded.zip end,
      phone = excluded.phone, sensitive = excluded.sensitive or referral_sources.sensitive,
      site_hashes = coalesce(excluded.site_hashes, referral_sources.site_hashes),
      -- A search that doesn't know the distance never wipes the one the card has.
      distance_miles = case when excluded.sensitive or referral_sources.sensitive then null else coalesce(excluded.distance_miles, referral_sources.distance_miles) end,
      fit_score = case when excluded.score_version = 0 then referral_sources.fit_score else excluded.fit_score end,
      score_version = case when excluded.score_version = 0 then referral_sources.score_version else excluded.score_version end,
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
 * what the card keeps. A few at a time, after the page is sent; 4 NPPES lookups
 * at once, and a second call while one runs waits for that one instead of starting another.
 */
export const RESCORE_CONCURRENCY = 4;
let rescoring: Promise<number> | null = null;

export function rescoreOldCards(
  sql: postgres.Sql = db(),
  lookup: (npi: string) => Promise<Provider | null> = (npi) => providerByNpi(npi),
  max = 25,
): Promise<number> {
  if (rescoring) return rescoring;
  rescoring = rescoreNow(sql, lookup, max).finally(() => {
    rescoring = null;
  });
  return rescoring;
}

async function rescoreNow(sql: postgres.Sql, lookup: (npi: string) => Promise<Provider | null>, max: number): Promise<number> {
  const facts = await practiceFacts(sql);
  const version = scoreVersionFor(facts.niche);
  const rows = await sql<
    { id: string; npi: string | null; taxonomy: string | null; npi_type: "individual" | "organization" | null; phone: string | null; state: string | null; address: string | null; distance_miles: number | null }[]
  >`
    select id, npi, taxonomy, npi_type, phone, state, address, distance_miles::float8 as distance_miles
      from practice_os.referral_sources where score_version <> ${version} limit ${max}`;
  const queue = [...rows];
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const ctx = { miles: row.distance_miles, ...tierContext(facts) };
      const p = row.npi ? await lookup(row.npi).catch(() => null) : null;
      const score = p
        ? providerTier(p, ctx).score
        : tierFor(
            { taxonomy: row.taxonomy, npiType: row.npi_type, phone: row.phone, state: row.state, homeAddress: row.npi_type !== "organization" && looksResidential(row.address) },
            ctx,
          ).score;
      // Ignored if she changed her niche while this ran: the next page load scores it for the new one.
      await sql`
        update practice_os.referral_sources set fit_score = ${score}, score_version = ${version}
         where id = ${row.id}
           and (select niche_preset from practice_os.referral_settings where id) is not distinct from ${facts.niche}::text`;
    }
  }
  await Promise.all(Array.from({ length: Math.min(RESCORE_CONCURRENCY, queue.length) }, worker));
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
// A sensitive card (DV/SA agency, shelter; migration 045) never gives out a street, ZIP or distance, whoever reads it.
const COLUMNS = `id, npi, name, organization, taxonomy, specialty, npi_type, credential,
  case when sensitive then null else address end as address, city, state, case when sensitive then null else zip end as zip,
  phone, email,
  case when stage = 'contacted' and next_follow_up_on <= $1::date then 'follow_up' else stage end as stage,
  case when sensitive then null else distance_miles::float8 end as distance_miles, fit_score, score_version, last_contacted_at, next_follow_up_on::text as next_follow_up_on,
  notes, is_sample, website, introduced_by, confidence,
  refers_via, referral_contact, populations, needs_from_therapist, waitlist, payer_mix, best_time,
  last_meeting_summary, connection_points, suggested_from, source_type, found_via, ccn, osm_ref, sensitive`;

/** Every card, best saved score first (the board and the plan then order them by tier.ts compareTiers, plan.ts rankCards). Read-only: due follow-ups show as Follow up without being moved. */
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

export function specialtyLabel(id: SpecialtyId): string {
  return SPECIALTY_BY_ID.get(id)!.label;
}

/** `sent`: she marked it sent (a sent_letter in her log) after approving it. Until then an approved letter is "Letter ready". */
export type LetterState = { approvalId: string; status: string; subject: string | null; letter: string | null; sent?: boolean; decidedAt?: string | null };

/** The latest introduction letter for each card, so the board can say where it stands. */
export async function latestLetters(sql: postgres.Sql = db()): Promise<Record<string, LetterState>> {
  // An edit made while approving is in the result; otherwise the letter as Muse wrote it.
  const rows = await sql<{ source_id: string; id: string; status: string; subject: string | null; letter: string | null; sent: boolean; decided_at: string | null }[]>`
    select distinct on (payload ->> 'referral_source_id')
           payload ->> 'referral_source_id' as source_id, a.id, a.status, a.decided_at::text as decided_at,
           coalesce(result #>> '{letter,subject}', payload ->> 'subject') as subject,
           coalesce(result #>> '{letter,body}', payload ->> 'letter') as letter,
           (a.status = 'done' and exists (
             select 1 from practice_os.referral_contacts c
              where c.source_id::text = a.payload ->> 'referral_source_id' and c.kind = 'sent_letter'
                and c.created_at >= a.decided_at)
             -- Letters approved before "I sent it" existed moved the card on approval.
             or exists (
             select 1 from practice_os.referral_sources s
              where s.id::text = a.payload ->> 'referral_source_id' and s.last_contacted_at >= a.decided_at)) as sent
      from practice_os.approvals a
     where kind = 'referral_letter' and payload ? 'referral_source_id'
     order by payload ->> 'referral_source_id', created_at desc`;
  return Object.fromEntries(
    rows.map((r) => [r.source_id, { approvalId: r.id, status: r.status, subject: r.subject, letter: r.letter, sent: Boolean(r.sent), decidedAt: r.decided_at }]),
  );
}
