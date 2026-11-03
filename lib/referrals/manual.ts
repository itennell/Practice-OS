// Cards she adds herself: one at a time from the form or the chat, or many
// from a spreadsheet (CSV). Plain code reads and checks each one; nothing here
// touches the database (lib/referrals/org-store.ts saves). Every card added this
// way is labelled "Added by you". Sensitive types (domestic violence and sexual
// assault agencies, shelters) keep only a city: the street and ZIP are dropped.
import { SOURCE_TYPE_BY_ID, SOURCE_TYPES } from "./catalog";
import { isSensitiveSource } from "./sensitive";
import { formatPhone, phoneDigits } from "./evidence/normalize";

export type ManualInput = {
  kind: "organization" | "person";
  name: string;
  organization: string | null;
  type: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  notes: string | null;
  npi: string | null;
};

export const CSV_COLUMNS = ["name", "kind", "organization", "type", "phone", "email", "street", "city", "state", "zip", "website", "notes", "npi"] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** The template she downloads: the columns and two fictional example rows. */
export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(","),
  '[Sample] Lakeside Cancer Support,organization,,disease_orgs,312-555-0142,hello@lakeside.example,,Chicago,IL,,https://lakeside.example,"Runs a monthly caregiver group",',
  "[Sample] Jordan Ellis,person,[Sample] Northside Hospital,nurse_navigators,312-555-0187,,,Chicago,IL,60614,,,",
].join("\r\n") + "\r\n";

export const MAX_ROWS = 200;
export const MAX_CSV_BYTES = 200_000;

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/i;
const URL_OK = /^https?:\/\/[^\s"'<>]+$/i;

/** A catalog type from its id or its label ("disease_orgs", "Funeral homes"), or null. */
export function typeFrom(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (SOURCE_TYPE_BY_ID.has(t)) return t;
  const low = t.toLowerCase();
  return SOURCE_TYPES.find((s) => s.label.toLowerCase() === low || s.id === low.replace(/[\s-]+/g, "_"))?.id ?? null;
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);

/**
 * Her words as a card, checked in plain code. Returns the clean input or the
 * first problem in plain words. A sensitive type keeps only the city and state.
 */
export function readManual(raw: Record<string, unknown>): { ok: true; input: ManualInput } | { ok: false; error: string } {
  const name = text(raw.name, 160);
  if (!name || name.length < 2) return { ok: false, error: "Give a name." };
  const type = typeFrom(typeof raw.type === "string" ? raw.type : null);
  if (!type) return { ok: false, error: "Pick what kind of referral source this is." };
  const organization = text(raw.organization, 160);
  const kindRaw = typeof raw.kind === "string" ? raw.kind.trim().toLowerCase() : "";
  const kind: ManualInput["kind"] =
    kindRaw === "person" || kindRaw === "individual" ? "person" : kindRaw === "organization" || kindRaw === "organisation" ? "organization" : organization && organization !== name ? "person" : "organization";
  const phoneRaw = text(raw.phone, 40);
  const phone = phoneRaw ? phoneDigits(phoneRaw) : null;
  if (phoneRaw && !phone) return { ok: false, error: `"${phoneRaw}" isn't a US phone number.` };
  const email = text(raw.email, 200)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) return { ok: false, error: `"${email}" isn't an email address.` };
  const website = text(raw.website, 300);
  if (website && !URL_OK.test(website)) return { ok: false, error: "A website starts with https://." };
  const state = text(raw.state, 2)?.toUpperCase() ?? null;
  if (state && !/^[A-Z]{2}$/.test(state)) return { ok: false, error: "Write the state as two letters, like IL." };
  const zipRaw = text(raw.zip, 10);
  const zip = zipRaw ? (zipRaw.match(/^(\d{5})(?:-\d{4})?$/)?.[1] ?? null) : null;
  if (zipRaw && !zip) return { ok: false, error: `"${zipRaw}" isn't a ZIP code.` };
  const npi = text(raw.npi, 10);
  if (npi && !/^\d{10}$/.test(npi)) return { ok: false, error: "An NPI is 10 digits." };
  const notes = text(raw.notes, 500);
  let street = text(raw.street ?? raw.address, 160);
  let zipOut = zip;
  const city = text(raw.city, 80);
  // Sensitive: never a street address or a ZIP, only the city (enforced again when saved, and by the database).
  const sensitive = isSensitiveSource({ type, name, organization });
  if (sensitive) {
    street = null;
    zipOut = null;
  }
  if (!city && !zipOut && !street && !sensitive) return { ok: false, error: "Give at least a city or a ZIP code." };
  if (sensitive && !city) return { ok: false, error: "Give the city (never their street address)." };
  return {
    ok: true,
    input: { kind, name, organization, type, phone: phone ? formatPhone(phone) : null, email, street, city, state, zip: zipOut, website, notes, npi },
  };
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, a BOM, CRLF. */
export function parseCsv(textIn: string): string[][] {
  const s = textIn.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type CsvRow = { line: number; raw: Record<string, string> } & ({ ok: true; input: ManualInput } | { ok: false; error: string });

/** The spreadsheet's rows, each read like the form. Columns by header name; unknown columns are ignored. */
export function readCsv(textIn: string): { rows: CsvRow[]; error: string | null } {
  if (textIn.length > MAX_CSV_BYTES) return { rows: [], error: "That file is too big. Keep it under 200 KB (about 200 rows)." };
  const table = parseCsv(textIn);
  if (table.length === 0) return { rows: [], error: "That file is empty." };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const col = (c: string) => header.indexOf(c === "street" && !header.includes("street") ? "address" : c);
  if (col("name") < 0 || col("type") < 0) return { rows: [], error: "The first row needs the column names, with at least name and type. Download the template to see them." };
  const body = table.slice(1);
  if (body.length > MAX_ROWS) return { rows: [], error: `That's ${body.length} rows. Import up to ${MAX_ROWS} at a time.` };
  const rows = body.map((cells, i): CsvRow => {
    const raw = Object.fromEntries(CSV_COLUMNS.map((c) => [c, col(c) >= 0 ? (cells[col(c)] ?? "").trim() : ""])) as Record<string, string>;
    const r = readManual(raw);
    return { line: i + 2, raw, ...r };
  });
  return { rows, error: null };
}
