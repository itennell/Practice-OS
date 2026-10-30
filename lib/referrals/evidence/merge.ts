// Many sources, one card: plain code merges what each source said into the
// value shown for each field, how sure Aeon is, a "Confirmed by" line and the
// conflicts in plain words. Who wins a field depends on the field: the state
// license list decides license status, the NPI Registry decides the NPI, the
// practice's own website beats the registries on phone and email (registries
// often keep a billing line), and what she typed beats everything.
import type { MatchMethod } from "./match";
import { formatPhone, normalizeName, normalizeOrg, normalizeStreet, phoneDigits, zip5 } from "./normalize";

export const ORIGINS = ["nppes", "cms_dac", "cms_order_referring", "cms_opt_out", "state_license", "osm", "website", "clinician"] as const;
export type Origin = (typeof ORIGINS)[number];

export const FIELDS = [
  "name", "credential", "organization", "address", "phone", "fax", "email", "website",
  "npi_status", "license_status", "medicare", "opt_out",
] as const;
export type Field = (typeof FIELDS)[number];

export type Fact = {
  field: Field;
  value: string;
  origin: Origin;
  originUrl?: string | null;
  method: MatchMethod | "manual";
  score?: number | null;
  checkedAt: string;
  /** e.g. { page: "https://…/contact", label: "on their contact page", robots: "allowed", unconfirmed: true } */
  detail?: Record<string, unknown>;
};

export type Confidence = "high" | "medium" | "low";
export type CardConfidence = "confirmed" | "partly" | "unconfirmed";

export type FieldView = {
  field: Field;
  value: string;
  /** The sources that gave this value, most trusted first. */
  origins: Origin[];
  confidence: Confidence;
  /** What the other sources said, when they disagree. */
  others: { origin: Origin; value: string }[];
  /** The best fact behind the value (for its page, label and date). */
  fact: Fact;
};

export type Evidence = {
  fields: Partial<Record<Field, FieldView>>;
  confirmedBy: string[];
  confidence: CardConfidence;
  conflicts: string[];
  flags: string[];
  checkedAt: string | null;
  stale: boolean;
};

export const ORIGIN_LABEL: Record<Origin, string> = {
  nppes: "NPI Registry",
  cms_dac: "Medicare clinician file",
  cms_order_referring: "Medicare order and referring list",
  cms_opt_out: "Medicare opt-out list",
  state_license: "State license list",
  osm: "OpenStreetMap",
  website: "their website",
  clinician: "you",
};

const FIELD_LABEL: Record<Field, string> = {
  name: "Name", credential: "Credential", organization: "Group", address: "Address", phone: "Phone", fax: "Fax",
  email: "Email", website: "Website", npi_status: "NPI", license_status: "License", medicare: "Medicare", opt_out: "Medicare opt-out",
};

// Most trusted first, per field. An origin not listed never decides that field.
const TRUST: Record<Field, Origin[]> = {
  name: ["clinician", "nppes", "state_license", "cms_dac", "cms_order_referring", "cms_opt_out", "website", "osm"],
  credential: ["clinician", "state_license", "nppes", "cms_dac"],
  organization: ["clinician", "nppes", "cms_dac", "website", "osm"],
  address: ["clinician", "nppes", "cms_dac", "website", "osm", "cms_opt_out"],
  phone: ["clinician", "website", "osm", "cms_dac", "nppes"],
  fax: ["clinician", "website", "nppes", "osm"],
  email: ["clinician", "website", "osm"],
  website: ["clinician", "website", "osm"],
  npi_status: ["nppes"],
  license_status: ["state_license"],
  medicare: ["cms_dac", "cms_order_referring"],
  opt_out: ["cms_opt_out"],
};

/** Where a field's own source of truth is (so one answer from it is enough). */
const AUTHORITY: Partial<Record<Field, Origin[]>> = {
  npi_status: ["nppes"],
  license_status: ["state_license"],
  medicare: ["cms_dac", "cms_order_referring"],
  opt_out: ["cms_opt_out"],
};

/** Disagreement on these is worth telling her. */
const CONFLICT_FIELDS: Field[] = ["name", "address", "phone", "fax", "email", "website"];

/** Sources that copy from each other count once toward "confirmed". */
const FAMILY: Record<Origin, string> = {
  nppes: "nppes", cms_dac: "cms", cms_order_referring: "cms", cms_opt_out: "cms",
  state_license: "state", osm: "osm", website: "website", clinician: "clinician",
};

export const STALE_DAYS = 30;

/** Values that mean "the source has no such record", not a fact about the card. */
const NO_RECORD = new Set(["not_found", "deactivated"]);

/** Two values of a field are the same when these keys are. */
export function valueKey(field: Field, value: string): string {
  switch (field) {
    case "phone":
    case "fax":
      return phoneDigits(value) || value.trim();
    case "address": {
      const [street] = value.split(",");
      return `${normalizeStreet(street)}|${zip5(value.match(/\b\d{5}(?:-\d{4})?\b(?!.*\b\d{5}\b)/)?.[0])}`;
    }
    case "name": {
      const n = normalizeName(value);
      return `${n.first}|${n.last}`;
    }
    case "organization":
      return normalizeOrg(value);
    case "email":
      return value.trim().toLowerCase();
    case "website":
      return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
    default:
      return value.trim().toLowerCase();
  }
}

function display(field: Field, value: string): string {
  return field === "phone" || field === "fax" ? formatPhone(phoneDigits(value)) || value : value;
}

function rank(field: Field, origin: Origin): number {
  const i = TRUST[field].indexOf(origin);
  return i < 0 ? 99 : i;
}

export function mergeField(field: Field, facts: Fact[]): FieldView | null {
  const usable = facts.filter((f) => f.field === field && rank(field, f.origin) < 99 && f.value.trim());
  if (usable.length === 0) return null;
  const groups = new Map<string, Fact[]>();
  for (const f of usable) {
    const k = valueKey(field, f.value);
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const ordered = [...groups.values()]
    .map((g) => g.sort((a, b) => rank(field, a.origin) - rank(field, b.origin)))
    .sort((a, b) => rank(field, a[0].origin) - rank(field, b[0].origin) || b.length - a.length);
  const [win, ...rest] = ordered;
  const best = win[0];
  const families = new Set(win.map((f) => FAMILY[f.origin]));
  const others = rest.map((g) => ({ origin: g[0].origin, value: display(field, g[0].value) }));
  let confidence: Confidence;
  if (best.origin === "clinician") confidence = "high";
  else if (best.detail?.unconfirmed) confidence = "low";
  else if (others.length > 0 && CONFLICT_FIELDS.includes(field)) confidence = "low";
  else if (AUTHORITY[field]?.includes(best.origin)) confidence = best.method === "name_city" ? "medium" : "high";
  else if (families.size >= 2) confidence = "high";
  else confidence = best.method === "name_city" ? "low" : "medium";
  return { field, value: display(field, best.value), origins: win.map((f) => f.origin), confidence, others, fact: best };
}

function listWords(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Everything known about one card, merged. `now` is for tests. */
export function mergeEvidence(facts: Fact[], opts: { isOrg?: boolean; now?: Date } = {}): Evidence {
  const fields: Partial<Record<Field, FieldView>> = {};
  for (const field of FIELDS) {
    const view = mergeField(field, facts);
    if (view) fields[field] = view;
  }

  const conflicts: string[] = [];
  for (const field of CONFLICT_FIELDS) {
    const v = fields[field];
    if (!v || v.others.length === 0 || v.origins[0] === "clinician") continue;
    const said = [`${ORIGIN_LABEL[v.origins[0]]} ${v.value}`, ...v.others.map((o) => `${ORIGIN_LABEL[o.origin]} ${o.value}`)];
    conflicts.push(`${FIELD_LABEL[field]} differs between sources: ${listWords(said)}.`);
  }

  const flags: string[] = [];
  const npi = fields.npi_status?.value;
  const license = fields.license_status?.value;
  const licenseBad = Boolean(license && license.toUpperCase() !== "ACTIVE");
  const npiGone = npi === "not_found" || npi === "deactivated";
  if (npi === "not_found") flags.push("Not in the NPI Registry any more (it may have been deactivated). Check before you write.");
  if (npi === "deactivated") flags.push("The NPI Registry shows this NPI as deactivated. Check before you write.");
  if (licenseBad) flags.push(`The state license list shows ${license!.toLowerCase()}. Check before you write.`);
  if (fields.opt_out?.value === "yes") flags.push("Opted out of Medicare, so the Medicare files won't list them. That's common in private pay.");

  // "Confirmed by": every source that agreed with what the card shows.
  const confirmedBy: string[] = [];
  const add = (label: string) => !confirmedBy.includes(label) && confirmedBy.push(label);
  for (const origin of ORIGINS) {
    if (origin === "clinician") continue;
    const agreed = facts.some((f) => f.origin === origin && fields[f.field]?.origins.includes(origin) && !NO_RECORD.has(f.value) && !f.detail?.unconfirmed);
    if (!agreed) continue;
    if (origin === "state_license" && license) add(`State license: ${license.toLowerCase()}`);
    else if (origin === "cms_dac" || origin === "cms_order_referring") add("Medicare file");
    else add(sentenceCase(ORIGIN_LABEL[origin]));
  }
  if (facts.some((f) => f.origin === "clinician")) add("You");

  // Only a match by NPI, or by name and street or phone, counts toward "confirmed": a name in the
  // same city (the state license list) could be someone else with that name.
  const families = new Set(
    facts
      .filter(
        (f) =>
          f.origin !== "clinician" &&
          !NO_RECORD.has(f.value) &&
          (f.method === "npi" || f.method === "name_address") &&
          !f.detail?.unconfirmed &&
          fields[f.field]?.origins.includes(f.origin),
      )
      .map((f) => FAMILY[f.origin]),
  );
  const coreConflict = conflicts.some((c) => c.startsWith("Name") || c.startsWith("Address"));
  let confidence: CardConfidence;
  if (npiGone || licenseBad || families.size === 0) confidence = "unconfirmed";
  else if (families.size >= 2 && !coreConflict && (npi === "active" || opts.isOrg || !fields.npi_status)) confidence = "confirmed";
  else confidence = "partly";

  const times = facts.filter((f) => f.origin !== "clinician").map((f) => new Date(f.checkedAt).getTime()).filter(Number.isFinite);
  const latest = times.length ? new Date(Math.max(...times)) : null;
  const now = opts.now ?? new Date();
  const stale = !latest || now.getTime() - latest.getTime() > STALE_DAYS * 24 * 3600 * 1000;
  return { fields, confirmedBy, confidence, conflicts, flags, checkedAt: latest?.toISOString() ?? null, stale };
}

export const CONFIDENCE_LABEL: Record<CardConfidence, string> = {
  confirmed: "Confirmed",
  partly: "Partly confirmed",
  unconfirmed: "Not confirmed",
};
