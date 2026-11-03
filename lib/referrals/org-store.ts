// Saving cards that have no NPI: hospices and home health agencies from the
// CMS Provider Data Catalog, places from OpenStreetMap, and organisations or
// people she adds herself (the form, the chat, a CSV). Each is matched against
// her board first (lib/referrals/dedupe.ts) so nothing is on it twice, checked
// against her do-not-contact list, and saved under Found with its evidence.
// A sensitive type (domestic violence and sexual assault agencies, shelters)
// is saved with its city only: the street and ZIP are stripped here, whatever
// the caller sent, and the database refuses them too (migration 045).
import type postgres from "postgres";
import { forgetAllowlist } from "../aeon/guard";
import { audit } from "../audit";
import { db } from "../db";
import { SOURCE_TYPE_BY_ID } from "./catalog";
import { isSensitiveSource } from "./sensitive";
import { checkNote, suppressedList } from "./contacts";
import { findDuplicate, DUP_LABEL, type DupHow } from "./dedupe";
import { isSuppressed } from "./dnc-key";
import type { Fact } from "./evidence/merge";
import { saveFacts } from "./evidence/store";
import { readCsv, type CsvRow, type ManualInput } from "./manual";
import { pdcFacts, type FoundOrg } from "./sources/cms-agencies";
import { osmOrgFacts } from "./sources/osm-orgs";
import { listSources, type ReferralSource } from "./store";
import { SCORE_VERSION } from "./tier";

export type FoundVia = "cms_provider_data" | "osm" | "manual";

export type OrgCard = {
  name: string;
  organization: string | null;
  npiType: "individual" | "organization";
  type: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  npi: string | null;
  ccn: string | null;
  osmRef: string | null;
  foundVia: FoundVia;
  distanceMiles: number | null;
  facts: Fact[];
};

/** Sensitive types keep a city only: no street, no ZIP, no address fact. Exported for the tests. */
export function stripSensitive<T extends Pick<OrgCard, "type" | "street" | "zip" | "facts"> & Partial<Pick<OrgCard, "name" | "organization" | "distanceMiles">>>(card: T): T {
  if (!isSensitiveSource({ type: card.type, name: card.name, organization: card.organization })) return card;
  return { ...card, street: null, zip: null, ...("distanceMiles" in card ? { distanceMiles: null } : {}), facts: card.facts.filter((f) => f.field !== "address") };
}

export type SaveResult = { id: string; name: string; added: boolean; matched?: { id: string; name: string; how: DupHow; label: string }; refused?: string };

/** Saves one card (or finds the one already on the board). Never sends anything. */
export async function saveOrgCard(input: OrgCard, opts: { sql?: postgres.Sql; cards?: ReferralSource[]; by?: "clinician" | "aeon" } = {}): Promise<SaveResult> {
  const sql = opts.sql ?? db();
  const card = stripSensitive(input);
  const cards = opts.cards ?? (await listSources(sql));
  const blocked = await suppressedList(sql);
  const keyCard = { npi: card.npi, name: card.name, organization: card.organization, npi_type: card.npiType, address: card.street, city: card.city, zip: card.zip };
  if (isSuppressed(keyCard, blocked)) return { id: "", name: card.name, added: false, refused: `${card.name} is on your do-not-contact list, so it wasn't added. Take them off the list first if that changed.` };
  const dup = findDuplicate(
    { npi: card.npi, ccn: card.ccn, osmRef: card.osmRef, name: card.name, organization: card.organization, isOrg: card.npiType === "organization", street: card.street, city: card.city, zip: card.zip, phone: card.phone },
    cards,
  );
  if (dup) {
    const matched = { id: dup.card.id, name: dup.card.name, how: dup.how, label: DUP_LABEL[dup.how] };
    // A search refreshing its own card (same CCN or OpenStreetMap id) updates what that source says; nothing she set changes.
    if ((dup.how === "ccn" || dup.how === "osm") && card.facts.length) {
      await sql`update practice_os.referral_sources set phone = coalesce(${card.phone}, phone), updated_at = now() where id = ${dup.card.id}`;
      await saveFacts(dup.card.id, card.facts, { checked: [card.facts[0].origin], sql });
    }
    return { id: dup.card.id, name: dup.card.name, added: false, matched };
  }
  const label = SOURCE_TYPE_BY_ID.get(card.type)?.label ?? null;
  const sensitive = isSensitiveSource({ type: card.type, name: card.name, organization: card.organization });
  const [row] = await sql<{ id: string }[]>`
    insert into practice_os.referral_sources
      (npi, name, organization, specialty, npi_type, address, city, state, zip, phone, email, website, notes,
       stage, distance_miles, fit_score, score_version, source_type, found_via, ccn, osm_ref, sensitive)
    values (${card.npi}, ${card.name}, ${card.organization}, ${label}, ${card.npiType}, ${card.street}, ${card.city}, ${card.state},
       ${card.zip}, ${card.phone}, ${card.email}, ${card.website}, ${card.notes}, 'found',
       ${card.distanceMiles === null ? null : Math.max(0, Math.min(500, card.distanceMiles))}, null, ${SCORE_VERSION},
       ${card.type}, ${card.foundVia}, ${card.ccn}, ${card.osmRef}, ${sensitive})
    returning id`;
  if (card.facts.length) await saveFacts(row.id, card.facts, { checked: [...new Set(card.facts.map((f) => f.origin))], sql });
  forgetAllowlist();
  cards.push({ id: row.id, name: card.name, npi: card.npi, ccn: card.ccn, osm_ref: card.osmRef, organization: card.organization, npi_type: card.npiType, address: card.street, city: card.city, zip: card.zip, phone: card.phone } as ReferralSource);
  return { id: row.id, name: card.name, added: true };
}

/** A found organisation (CMS or OpenStreetMap) as a card to save. */
export function orgToCard(org: FoundOrg, distanceMiles: number | null): OrgCard {
  return {
    name: org.name,
    organization: org.name,
    npiType: "organization",
    type: org.type,
    street: org.street,
    city: org.city,
    state: org.state,
    zip: org.zip,
    phone: org.phone,
    email: null,
    website: org.website,
    notes: null,
    npi: null,
    ccn: org.ccn,
    osmRef: org.osmRef,
    foundVia: org.origin === "cms_pdc" ? "cms_provider_data" : "osm",
    distanceMiles,
    facts: org.origin === "cms_pdc" ? pdcFacts(org) : osmOrgFacts(org),
  };
}

/** What she typed as a card: her words are the evidence ("you"), labelled "Added by you". */
export function manualToCard(m: ManualInput): OrgCard {
  const checkedAt = new Date().toISOString();
  const base = { origin: "clinician" as const, method: "manual" as const, checkedAt, detail: { label: "you added it" } };
  const facts: Fact[] = [{ ...base, field: "name", value: m.name }];
  if (m.organization && m.kind === "person") facts.push({ ...base, field: "organization", value: m.organization });
  const address = [m.street, m.city, [m.state, m.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (m.street) facts.push({ ...base, field: "address", value: address });
  if (m.phone) facts.push({ ...base, field: "phone", value: m.phone });
  if (m.email) facts.push({ ...base, field: "email", value: m.email, detail: { label: "you typed it" } });
  if (m.website) facts.push({ ...base, field: "website", value: m.website });
  return {
    name: m.name,
    organization: m.kind === "person" ? m.organization : (m.organization ?? m.name),
    npiType: m.kind === "person" ? "individual" : "organization",
    type: m.type,
    street: m.street,
    city: m.city,
    state: m.state,
    zip: m.zip,
    phone: m.phone,
    email: m.email,
    website: m.website,
    notes: m.notes,
    npi: m.npi,
    ccn: null,
    osmRef: null,
    foundVia: "manual",
    distanceMiles: null,
    facts,
  };
}

type Check = (t: string) => Promise<{ ok: boolean } & Record<string, unknown>>;

/** One card she added herself. Her notes go through the privacy check first. Throws in plain words. */
export async function addManual(m: ManualInput, opts: { sql?: postgres.Sql; by?: "clinician" | "aeon"; check?: Check } = {}): Promise<SaveResult> {
  const sql = opts.sql ?? db();
  if (m.notes) {
    const refused = await checkNote(m.notes, opts.check as Parameters<typeof checkNote>[1]);
    if (refused) throw new Error(refused);
  }
  const r = await saveOrgCard(manualToCard(m), { sql, by: opts.by });
  if (r.added) {
    await audit({ actor: opts.by ?? "clinician", action: "referral_source_added_by_hand", subjectType: "referral_source", subjectId: r.id, details: { type: m.type, kind: m.kind } }, sql);
  }
  return r;
}

export type PreviewRow = {
  line: number;
  name: string;
  type: string | null;
  status: "new" | "matched" | "error" | "do_not_contact";
  matched?: { id: string; name: string; label: string };
  error?: string;
};

/** Reads a CSV and says, row by row, what an import would do. Saves nothing. */
export async function previewImport(csv: string, sql: postgres.Sql = db()): Promise<{ rows: PreviewRow[]; error: string | null; parsed: CsvRow[] }> {
  const { rows, error } = readCsv(csv);
  if (error) return { rows: [], error, parsed: [] };
  const cards = await listSources(sql);
  const blocked = await suppressedList(sql);
  const seen: { id: string; name: string; organization: string | null; npi_type: "individual" | "organization"; address: string | null; city: string | null; zip: string | null; phone: string | null; npi: string | null }[] = [];
  const out: PreviewRow[] = rows.map((r) => {
    if (!r.ok) return { line: r.line, name: r.raw.name || "(no name)", type: null, status: "error", error: r.error };
    const c = manualToCard(r.input);
    const keyCard = { npi: c.npi, name: c.name, organization: c.organization, npi_type: c.npiType, address: c.street, city: c.city, zip: c.zip };
    if (isSuppressed(keyCard, blocked)) return { line: r.line, name: c.name, type: c.type, status: "do_not_contact" };
    const dupIn = { npi: c.npi, name: c.name, organization: c.organization, isOrg: c.npiType === "organization", street: c.street, city: c.city, zip: c.zip, phone: c.phone };
    const dup = findDuplicate(dupIn, cards);
    if (dup) return { line: r.line, name: c.name, type: c.type, status: "matched", matched: { id: dup.card.id, name: dup.card.name, label: DUP_LABEL[dup.how] } };
    // The same one twice in the file: the second is a match of the first.
    const twice = findDuplicate(dupIn, seen.map((s) => ({ ...s, address: s.address })));
    if (twice) return { line: r.line, name: c.name, type: c.type, status: "matched", matched: { id: "", name: `${twice.card.name} (earlier in this file)`, label: DUP_LABEL[twice.how] } };
    seen.push({ id: `line-${r.line}`, name: c.name, organization: c.organization, npi_type: c.npiType, address: c.street, city: c.city, zip: c.zip, phone: c.phone, npi: c.npi });
    return { line: r.line, name: c.name, type: c.type, status: "new" };
  });
  return { rows: out, error: null, parsed: rows };
}

/** Adds the CSV's new rows (minus any she unticked). Read again on the server; matched rows are never added twice. */
export async function commitImport(csv: string, skip: number[], opts: { sql?: postgres.Sql; check?: Check } = {}): Promise<{ added: SaveResult[]; matched: number; failed: { line: number; error: string }[] }> {
  const sql = opts.sql ?? db();
  const { rows, error, parsed } = await previewImport(csv, sql);
  if (error) throw new Error(error);
  const skipped = new Set(skip);
  const added: SaveResult[] = [];
  const failed: { line: number; error: string }[] = [];
  let matched = 0;
  const cards = await listSources(sql);
  for (const row of rows) {
    if (row.status === "matched") matched++;
    if (row.status !== "new" || skipped.has(row.line)) continue;
    const p = parsed.find((x) => x.line === row.line);
    if (!p?.ok) continue;
    try {
      if (p.input.notes) {
        const refused = await checkNote(p.input.notes, opts.check as Parameters<typeof checkNote>[1]);
        if (refused) throw new Error(refused);
      }
      const r = await saveOrgCard(manualToCard(p.input), { sql, cards });
      if (r.added) added.push(r);
      else if (r.matched) matched++;
      else if (r.refused) failed.push({ line: row.line, error: r.refused });
    } catch (err) {
      failed.push({ line: row.line, error: err instanceof Error ? err.message : "Couldn't add it." });
    }
  }
  await audit({ actor: "clinician", action: "referral_sources_imported", subjectType: "referral_sources", details: { added: added.length, matched, failed: failed.length } }, sql);
  return { added, matched, failed };
}
