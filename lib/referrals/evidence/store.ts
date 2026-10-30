// referral_facts: one row per field per source for a card. Saving facts
// re-merges the card and keeps the result on referral_sources (checked_at,
// confidence, conflicts), so the board can sort and filter without merging.
import type postgres from "postgres";
import { db } from "../../db";
import type { Provider } from "../nppes";
import { addressLine } from "./normalize";
import { mergeEvidence, type Evidence, type Fact, type Field, type Origin } from "./merge";

export { addressLine };

const NPPES_PAGE = "https://npiregistry.cms.hhs.gov/provider-view/";

/** What the NPI Registry says about a provider, as facts. */
export function nppesFacts(p: Provider, checkedAt = new Date().toISOString()): Fact[] {
  const base = { origin: "nppes" as const, originUrl: `${NPPES_PAGE}${p.npi}`, method: "npi" as const, score: 1, checkedAt };
  const facts: Fact[] = [
    { ...base, field: "npi_status", value: "active" },
    { ...base, field: "name", value: p.npiType === "organization" ? (p.organization ?? p.name) : p.name },
  ];
  if (p.credential) facts.push({ ...base, field: "credential", value: p.credential });
  if (p.practiceName && p.npiType === "organization") facts.push({ ...base, field: "organization", value: p.practiceName });
  const address = addressLine(p.address, p.city, p.state, p.zip);
  if (address) facts.push({ ...base, field: "address", value: address });
  if (p.phone) facts.push({ ...base, field: "phone", value: p.phone });
  if (p.fax) facts.push({ ...base, field: "fax", value: p.fax });
  return facts;
}

/** An NPI the registry no longer answers for. */
export function nppesNotFound(npi: string, checkedAt = new Date().toISOString()): Fact {
  return { field: "npi_status", value: "not_found", origin: "nppes", originUrl: `${NPPES_PAGE}${npi}`, method: "npi", score: 1, checkedAt };
}

type FactRow = {
  source_id: string;
  field: Field;
  value: string;
  origin: Origin;
  origin_url: string | null;
  match_method: Fact["method"];
  match_score: number | null;
  detail: Record<string, unknown>;
  checked_at: Date;
};

const toFact = (r: FactRow): Fact => ({
  field: r.field,
  value: r.value,
  origin: r.origin,
  originUrl: r.origin_url,
  method: r.match_method,
  score: r.match_score === null ? null : Number(r.match_score),
  checkedAt: r.checked_at.toISOString(),
  detail: r.detail,
});

/**
 * Replaces what these origins said about a card with `facts` (an origin that
 * answered again but no longer gives a field loses that field), then re-merges.
 * `checked` lists origins asked even when they gave nothing.
 */
export async function saveFacts(
  sourceId: string,
  facts: Fact[],
  opts: { checked?: Origin[]; sql?: postgres.Sql } = {},
): Promise<Evidence> {
  const sql = opts.sql ?? db();
  const origins = [...new Set([...(opts.checked ?? []), ...facts.map((f) => f.origin)])];
  await sql.begin(async (tx) => {
    if (origins.length) await tx`delete from practice_os.referral_facts where source_id = ${sourceId} and origin in ${tx(origins)}`;
    if (facts.length) {
      const rows = facts.map((f) => ({
        source_id: sourceId,
        field: f.field,
        value: f.value.slice(0, 500),
        origin: f.origin,
        origin_url: f.originUrl && f.originUrl.startsWith("https://") ? f.originUrl : null,
        match_method: f.method,
        match_score: f.score ?? null,
        detail: tx.json((f.detail ?? {}) as postgres.JSONValue),
        checked_at: f.checkedAt,
      }));
      await tx`insert into practice_os.referral_facts ${tx(rows)}
        on conflict (source_id, field, origin) do update set value = excluded.value, origin_url = excluded.origin_url,
          match_method = excluded.match_method, match_score = excluded.match_score, detail = excluded.detail, checked_at = excluded.checked_at`;
    }
  });
  return summarize(sourceId, sql);
}

export async function factsFor(sourceIds: string[], sql: postgres.Sql = db()): Promise<Map<string, Fact[]>> {
  const out = new Map<string, Fact[]>();
  if (sourceIds.length === 0) return out;
  const rows = await sql<FactRow[]>`
    select source_id, field, value, origin, origin_url, match_method, match_score, detail, checked_at
      from practice_os.referral_facts where source_id in ${sql(sourceIds)} order by checked_at`;
  for (const r of rows) out.set(r.source_id, [...(out.get(r.source_id) ?? []), toFact(r)]);
  return out;
}

/** Re-merges one card's facts and writes the result onto the card. */
export async function summarize(sourceId: string, sql: postgres.Sql = db()): Promise<Evidence> {
  const [card] = await sql<{ npi_type: string | null }[]>`select npi_type from practice_os.referral_sources where id = ${sourceId}`;
  const facts = (await factsFor([sourceId], sql)).get(sourceId) ?? [];
  const ev = mergeEvidence(facts, { isOrg: card?.npi_type === "organization" });
  const email = ev.fields.email?.value ?? null;
  const website = ev.fields.website?.value ?? null;
  await sql`
    update practice_os.referral_sources
       set checked_at = ${ev.checkedAt}, confidence = ${ev.confidence}, conflicts = ${sql.json(ev.conflicts)},
           email = coalesce(${email}, email),
           website = coalesce(${website && /^https?:\/\//.test(website) ? website : null}, website)
     where id = ${sourceId}`;
  return ev;
}

/** Merged evidence for many cards at once (the board). */
export async function evidenceFor(
  cards: { id: string; npi_type: string | null }[],
  sql: postgres.Sql = db(),
  now = new Date(),
): Promise<Record<string, Evidence>> {
  const facts = await factsFor(cards.map((c) => c.id), sql);
  return Object.fromEntries(cards.map((c) => [c.id, mergeEvidence(facts.get(c.id) ?? [], { isOrg: c.npi_type === "organization", now })]));
}

/** The email she typed for a card (null clears it, and the card falls back to what Aeon found). */
export async function setTypedEmail(sourceId: string, email: string | null, sql: postgres.Sql = db()): Promise<Evidence> {
  if (email === null) {
    await sql`delete from practice_os.referral_facts where source_id = ${sourceId} and origin = 'clinician' and field = 'email'`;
    await sql`update practice_os.referral_sources set email = null where id = ${sourceId}`;
    return summarize(sourceId, sql);
  }
  const fact: Fact = { field: "email", value: email.toLowerCase(), origin: "clinician", method: "manual", checkedAt: new Date().toISOString(), detail: { label: "you typed it" } };
  const others = ((await factsFor([sourceId], sql)).get(sourceId) ?? []).filter((f) => f.origin === "clinician" && f.field !== "email");
  return saveFacts(sourceId, [...others, fact], { checked: ["clinician"], sql });
}
