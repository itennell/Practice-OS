// `npm run demo:check` (scripts/demo-check.ts): a plain check, right before the Nov 4
// recording, that the running database is ready for the Referrals demo. Reads only.
// Every line is PASS, FAIL or WARN in plain English; any FAIL means "fix before recording".
import postgres from "postgres";
import { DEMO_NICHE, DEMO_ZIP, resetRefusal } from "./demo-reset";
import { isDryRun } from "./env";
import { REFERRALS_ONLY_DEMO } from "./features";
import { SPECIALTY_CATEGORY } from "./referrals/categories";
import { categoryOf } from "./referrals/catalog";
import { haversineMiles, zipCenters } from "./referrals/geo";
import { specialtyForCode } from "./referrals/nppes";
import { isSensitiveSource } from "./referrals/sensitive";

export const NEAR_MILES = 5;
export const MIN_NEAR_CARDS = 20;
export const MIN_CATEGORIES = 5;

export type CardKind = "nppes" | "cms" | "osm" | "manual_sample" | "other";
export const KIND_LABEL: Record<Exclude<CardKind, "other">, string> = {
  nppes: "the NPI Registry",
  cms: "Medicare's Provider Data Catalog (CMS)",
  osm: "OpenStreetMap",
  manual_sample: "a [Sample] partner added by hand",
};

export type DemoCard = {
  name: string;
  kind: CardKind;
  category: number | null;
  /** Miles from 60614: the card's own distance, else its ZIP's center. Null when unknown. */
  miles: number | null;
  sensitive: boolean;
  /** Reads as a DV/SA agency or shelter by kind or name, even if not marked. */
  looksSensitive: boolean;
  hasAddress: boolean;
};

export type DemoSnapshot = {
  referralsOnly: boolean;
  dryRun: boolean;
  niche: string | null;
  approvalMode: string | null;
  cards: DemoCard[];
  lastReset: Date | null;
  /** Her own (not [Sample]) chats and approvals from before the last reset, and since. */
  beforeReset: { conversations: number; approvals: number };
  sinceReset: { conversations: number; approvals: number };
};

export type CheckLine = { status: "PASS" | "FAIL" | "WARN"; text: string };

export function checkRefusal(url: string, expectedRef: string | undefined): string | null {
  return resetRefusal(url, expectedRef)?.replace("Refusing to reset", "Refusing to check the demo") ?? null;
}

/** Where a card came from, by what the board stores. */
export function cardKind(c: { found_via: string | null; npi: string | null; ccn: string | null; osm_ref: string | null; is_sample: boolean }): CardKind {
  if (c.found_via === "cms_provider_data" || (!c.found_via && c.ccn)) return "cms";
  if (c.found_via === "osm" || (!c.found_via && c.osm_ref)) return "osm";
  if (c.found_via === "nppes" || (!c.found_via && c.npi)) return "nppes";
  if (c.is_sample && (c.found_via === "manual" || !c.found_via)) return "manual_sample";
  return "other";
}

/** The card's catalog category: its kind, else its NPPES specialty's. */
export function cardCategory(c: { source_type: string | null; taxonomy: string | null }): number | null {
  const byType = c.source_type ? categoryOf(c.source_type) : null;
  if (byType) return byType;
  const spec = c.taxonomy ? specialtyForCode(c.taxonomy) : null;
  return spec ? (SPECIALTY_CATEGORY[spec.id] ?? null) : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The checks, in plain code, on a snapshot. */
export function evaluateDemo(s: DemoSnapshot): CheckLine[] {
  const out: CheckLine[] = [];
  const line = (ok: boolean, pass: string, fail: string, warnOnly = false) =>
    out.push({ status: ok ? "PASS" : warnOnly ? "WARN" : "FAIL", text: ok ? pass : fail });

  line(s.referralsOnly, "The app is in the Referrals-only demo (REFERRALS_ONLY_DEMO is on).", "REFERRALS_ONLY_DEMO is off in lib/features.ts. Turn it on and rebuild.");
  line(
    s.niche === DEMO_NICHE,
    "Dana's niche is oncology / serious illness / end of life.",
    `Dana's niche is ${s.niche ? `"${s.niche}"` : "not set"}, not the oncology preset. Run npm run db:reset.`,
  );

  const near = s.cards.filter((c) => c.miles !== null && c.miles <= NEAR_MILES);
  const cats = new Set(near.map((c) => c.category).filter((c): c is number => c !== null));
  line(
    near.length >= MIN_NEAR_CARDS && cats.size >= MIN_CATEGORIES,
    `${near.length} cards within ${NEAR_MILES} miles of ${DEMO_ZIP}, across ${cats.size} categories.`,
    `Only ${plural(near.length, "card")} within ${NEAR_MILES} miles of ${DEMO_ZIP} across ${plural(cats.size, "category", "categories")} (need ${MIN_NEAR_CARDS} across ${MIN_CATEGORIES}). Run npm run demo:warm.`,
  );

  for (const kind of Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]) {
    const n = s.cards.filter((c) => c.kind === kind).length;
    line(n > 0, `${plural(n, "card")} from ${KIND_LABEL[kind]}.`, `No card from ${KIND_LABEL[kind]}. ${kind === "manual_sample" ? "Run npm run db:reset." : "Run npm run demo:warm."}`);
  }

  const leaky = s.cards.filter((c) => (c.sensitive || c.looksSensitive) && c.hasAddress);
  line(
    leaky.length === 0,
    "No domestic violence, sexual assault or shelter card shows an address.",
    `${plural(leaky.length, "sensitive card")} ${leaky.length === 1 ? "shows" : "show"} an address: ${leaky.map((c) => c.name).slice(0, 5).join(", ")}. Mark them sensitive or remove them before recording.`,
  );

  line(
    s.approvalMode !== "bypass",
    `Approvals ask first (default mode: ${s.approvalMode ?? "auto"}). Set Ask under the message box for the recording.`,
    "The default approval mode is Bypass: set it to Ask under the message box before recording.",
    true,
  );
  line(s.dryRun, "DRY_RUN is on: approved actions are logged, never sent.", "DRY_RUN is false in .env. Set DRY_RUN=true and restart the app.");

  if (!s.lastReset) {
    out.push({ status: "FAIL", text: "No demo reset found. Run npm run db:reset." });
  } else {
    const before = s.beforeReset.conversations + s.beforeReset.approvals;
    line(
      before === 0,
      "No chats or approvals left from before the last reset.",
      `${plural(s.beforeReset.conversations, "chat")} and ${plural(s.beforeReset.approvals, "approval")} from before the last reset are still there. Run npm run db:reset.`,
    );
    const since = s.sinceReset.conversations + s.sinceReset.approvals;
    line(
      since === 0,
      "No test chats or approvals since the reset.",
      `${plural(s.sinceReset.conversations, "chat")} and ${plural(s.sinceReset.approvals, "approval")} since the reset (a rehearsal?). Run npm run db:reset, then npm run demo:warm, for a clean start.`,
      true,
    );
  }
  return out;
}

/** What the checks read from the database and the environment. */
export async function loadDemoSnapshot(sql: postgres.Sql, env: { dryRun?: boolean; referralsOnly?: boolean } = {}): Promise<DemoSnapshot> {
  const [settings] = await sql<{ niche_preset: string | null }[]>`select niche_preset from practice_os.referral_settings where id`;
  const [mode] = await sql<{ approval_mode: string | null }[]>`select approval_mode from practice_os.settings limit 1`;
  const rows = await sql<
    {
      name: string;
      organization: string | null;
      taxonomy: string | null;
      source_type: string | null;
      found_via: string | null;
      npi: string | null;
      ccn: string | null;
      osm_ref: string | null;
      is_sample: boolean;
      sensitive: boolean;
      address: string | null;
      zip: string | null;
      distance_miles: number | null;
    }[]
  >`select name, organization, taxonomy, source_type, found_via, npi, ccn, osm_ref, is_sample, sensitive, address, zip,
           distance_miles::float8 as distance_miles
      from practice_os.referral_sources where stage <> 'not_a_fit'`;
  const centers = await zipCenters();
  const home = centers[DEMO_ZIP];
  const cards: DemoCard[] = rows.map((r) => {
    const z = r.zip?.slice(0, 5);
    const byZip = z && centers[z] && home ? haversineMiles(home, centers[z]) : null;
    return {
      name: r.name,
      kind: cardKind(r),
      category: cardCategory(r),
      miles: r.distance_miles ?? byZip,
      sensitive: r.sensitive,
      looksSensitive: isSensitiveSource({ source_type: r.source_type, taxonomy: r.taxonomy, name: r.name, organization: r.organization }),
      hasAddress: Boolean(r.address || r.zip),
    };
  });
  const [reset] = await sql<{ at: Date | null }[]>`select max(at) as at from practice_os.audit_log where action = 'demo_reset'`;
  const at = reset?.at ?? null;
  const count = async (table: "conversations" | "approvals", before: boolean) => {
    if (!at) return 0;
    const [r] = before
      ? await sql<{ n: number }[]>`select count(*)::int as n from ${sql(`practice_os.${table}`)} where not is_sample and created_at < ${at}`
      : await sql<{ n: number }[]>`select count(*)::int as n from ${sql(`practice_os.${table}`)} where not is_sample and created_at >= ${at}`;
    return r.n;
  };
  return {
    referralsOnly: env.referralsOnly ?? REFERRALS_ONLY_DEMO,
    dryRun: env.dryRun ?? isDryRun(),
    niche: settings?.niche_preset ?? null,
    approvalMode: mode?.approval_mode ?? null,
    cards,
    lastReset: at,
    beforeReset: { conversations: await count("conversations", true), approvals: await count("approvals", true) },
    sinceReset: { conversations: await count("conversations", false), approvals: await count("approvals", false) },
  };
}

export async function checkDemo(opts: { url: string; expectedRef?: string; env?: { dryRun?: boolean; referralsOnly?: boolean } }): Promise<CheckLine[]> {
  const refusal = checkRefusal(opts.url, opts.expectedRef ?? process.env.SUPABASE_PROJECT_REF);
  if (refusal) throw new Error(refusal);
  const sql = postgres(opts.url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return evaluateDemo(await loadDemoSnapshot(sql, opts.env));
  } finally {
    await sql.end();
  }
}
