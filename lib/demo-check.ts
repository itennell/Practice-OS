// `npm run demo:check` (scripts/demo-check.ts): a plain check, right before the Nov 4
// recording, that the running database is ready for the Referrals demo. Reads only.
// Every line is PASS, FAIL or WARN in plain English; any FAIL means "fix before recording".
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import type postgres from "postgres";
import { poolerSafeClient } from "./db";
import { DEMO_NICHE, DEMO_ZIP, resetRefusal } from "./demo-reset";
import { SPECIALTY_CATEGORY } from "./referrals/categories";
import { categoryOf } from "./referrals/catalog";
import { suppressedList } from "./referrals/contacts";
import { isSuppressed } from "./referrals/dnc-key";
import { haversineMiles, zipCenters } from "./referrals/geo";
import { specialtyForCode } from "./referrals/nppes";
import { isSensitiveSource } from "./referrals/sensitive";
import { NPPES_KEY_PREFIX } from "./referrals/sources/stored-keys";

export const NEAR_MILES = 5;
export const MIN_NEAR_CARDS = 20;
export const MIN_CATEGORIES = 5;
/** demo:warm's answers last a day (lib/referrals/sources/stored-cache.ts). */
export const WARM_FRESH_MS = 24 * 3600 * 1000;
/** demo:check gives up after this long instead of waiting forever on the database. */
export const CHECK_TIMEOUT_MS = 60_000;
export function checkTimeoutMessage(ms: number = CHECK_TIMEOUT_MS): string {
  return `demo:check stopped after ${Math.round(ms / 1000)} seconds without an answer from the database, so the demo wasn't checked. The check only reads, so it changed nothing. Make sure the database is reachable, then run npm run demo:check again.`;
}
/** The env files Next.js reads for `npm start`, highest priority first. */
export const ENV_FILES = [".env.production.local", ".env.local", ".env.production", ".env"] as const;

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
  /** On her do-not-contact list (025 by NPI, 045 by org key): never counted. */
  doNotContact: boolean;
};

export type DemoSnapshot = {
  now: Date;
  /** DRY_RUN as each env file sets it (files that don't set it are left out). */
  dryRunFiles: { file: string; value: string }[];
  niche: string | null;
  /** settings.approval_mode: the default for new chats. */
  approvalMode: string | null;
  /** The latest chat's own mode (null: it uses the default), or null when there is no chat. */
  latestChat: { mode: string | null } | null;
  cards: DemoCard[];
  /** NPI Registry pages kept in referral_fetch_cache within the last day. */
  nppesPagesLastDay: number;
  lastWarm: Date | null;
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
const MODE_LABEL: Record<string, string> = { manual: "Ask", auto: "Auto", bypass: "Bypass" };
const modeLabel = (m: string | null) => MODE_LABEL[m ?? "auto"] ?? m ?? "Auto";
const hoursAgo = (now: Date, at: Date) => Math.round((now.getTime() - at.getTime()) / 3_600_000);

/** The checks, in plain code, on a snapshot. */
export function evaluateDemo(s: DemoSnapshot): CheckLine[] {
  const out: CheckLine[] = [];
  const line = (ok: boolean, pass: string, fail: string, warnOnly = false) =>
    out.push({ status: ok ? "PASS" : warnOnly ? "WARN" : "FAIL", text: ok ? pass : fail });

  line(
    s.niche === DEMO_NICHE,
    "Dana's niche is oncology / serious illness / end of life.",
    `Dana's niche is ${s.niche ? `"${s.niche}"` : "not set"}, not the oncology preset. Run npm run db:reset.`,
  );

  // Do-not-contact cards never show in the plan or letters, so they don't count toward a full board.
  const counted = s.cards.filter((c) => !c.doNotContact);
  const near = counted.filter((c) => c.miles !== null && c.miles <= NEAR_MILES);
  const cats = new Set(near.map((c) => c.category).filter((c): c is number => c !== null));
  line(
    near.length >= MIN_NEAR_CARDS && cats.size >= MIN_CATEGORIES,
    `${near.length} cards within ${NEAR_MILES} miles of ${DEMO_ZIP}, across ${cats.size} categories (do-not-contact cards left out).`,
    `Only ${plural(near.length, "card")} within ${NEAR_MILES} miles of ${DEMO_ZIP} across ${plural(cats.size, "category", "categories")} (need ${MIN_NEAR_CARDS} across ${MIN_CATEGORIES}; do-not-contact cards left out). Run npm run demo:warm.`,
  );

  for (const kind of Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]) {
    const n = counted.filter((c) => c.kind === kind).length;
    line(n > 0, `${plural(n, "card")} from ${KIND_LABEL[kind]}.`, `No card from ${KIND_LABEL[kind]}. ${kind === "manual_sample" ? "Run npm run db:reset." : "Run npm run demo:warm."}`);
  }

  const leaky = s.cards.filter((c) => (c.sensitive || c.looksSensitive) && c.hasAddress);
  line(
    leaky.length === 0,
    "No domestic violence, sexual assault or shelter card shows an address.",
    `${plural(leaky.length, "sensitive card")} ${leaky.length === 1 ? "shows" : "show"} an address: ${leaky.map((c) => c.name).slice(0, 5).join(", ")}. Mark them sensitive or remove them before recording.`,
  );

  // The recording needs every change to wait for an approval on screen: Ask (manual) only.
  line(
    s.approvalMode === "manual",
    "New chats start in Ask: every change waits for her approval.",
    `New chats start in ${modeLabel(s.approvalMode)}, not Ask. Set Ask under the message box before recording.`,
    true,
  );
  if (s.latestChat) {
    const mode = s.latestChat.mode ?? s.approvalMode;
    line(mode === "manual", "The latest chat is in Ask.", `The latest chat is in ${modeLabel(mode)}, not Ask. Switch it to Ask, or start a new chat.`, true);
  }

  // Read from the env files, not the running app's environment (restart the app after a change).
  const notTrue = s.dryRunFiles.filter((f) => f.value !== "true");
  if (notTrue.length) {
    out.push({
      status: "FAIL",
      text: `DRY_RUN is ${notTrue.map((f) => `"${f.value}" in ${f.file}`).join(", ")}. Set DRY_RUN=true there and restart the app. (Read from the env files only, not the running app.)`,
    });
  } else if (s.dryRunFiles.length === 0) {
    out.push({ status: "WARN", text: "DRY_RUN isn't set in .env, so executors only log (the default). Set DRY_RUN=true to be sure. (Read from the env files only.)" });
  } else {
    out.push({ status: "PASS", text: `DRY_RUN=true in ${s.dryRunFiles.map((f) => f.file).join(" and ")}: approved actions are logged, never sent. (Read from the env files only; restart the app after a change.)` });
  }

  line(
    s.nppesPagesLastDay > 0,
    `${plural(s.nppesPagesLastDay, "NPI Registry page")} saved in the last 24 hours: the map opens without waiting.`,
    "No NPI Registry pages saved in the last 24 hours, so the map would wait on the registry. Run npm run demo:warm.",
  );
  const warmFresh = s.lastWarm !== null && s.now.getTime() - s.lastWarm.getTime() < WARM_FRESH_MS;
  line(
    warmFresh,
    `demo:warm ran ${hoursAgo(s.now, s.lastWarm ?? s.now)} hours ago.`,
    s.lastWarm ? `demo:warm last ran ${hoursAgo(s.now, s.lastWarm)} hours ago. Run npm run demo:warm again.` : "demo:warm hasn't run. Run npm run demo:warm.",
  );

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

/** DRY_RUN as each env file in `dir` sets it. A missing file is skipped. */
export async function readDryRunFiles(dir: string = process.cwd()): Promise<{ file: string; value: string }[]> {
  const out: { file: string; value: string }[] = [];
  for (const file of ENV_FILES) {
    const text = await readFile(path.join(dir, file), "utf8").catch(() => null);
    if (text === null) continue;
    const value = parse(text).DRY_RUN;
    if (value !== undefined) out.push({ file, value: value.trim() });
  }
  return out;
}

/** What the checks read from the database and the env files. */
export async function loadDemoSnapshot(sql: postgres.Sql, opts: { envDir?: string; dryRunFiles?: { file: string; value: string }[]; now?: Date } = {}): Promise<DemoSnapshot> {
  const now = opts.now ?? new Date();
  const [settings] = await sql<{ niche_preset: string | null }[]>`select niche_preset from practice_os.referral_settings where id`;
  const [mode] = await sql<{ approval_mode: string | null }[]>`select approval_mode from practice_os.settings limit 1`;
  const [chat] = await sql<{ approval_mode: string | null }[]>`select approval_mode from practice_os.conversations order by updated_at desc, created_at desc limit 1`;
  const rows = await sql<
    {
      name: string;
      organization: string | null;
      npi_type: "individual" | "organization" | null;
      taxonomy: string | null;
      source_type: string | null;
      found_via: string | null;
      npi: string | null;
      ccn: string | null;
      osm_ref: string | null;
      is_sample: boolean;
      sensitive: boolean;
      address: string | null;
      city: string | null;
      zip: string | null;
      distance_miles: number | null;
    }[]
  >`select name, organization, npi_type, taxonomy, source_type, found_via, npi, ccn, osm_ref, is_sample, sensitive, address, city, zip,
           distance_miles::float8 as distance_miles
      from practice_os.referral_sources where stage <> 'not_a_fit'`;
  const blocked = await suppressedList(sql);
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
      doNotContact: isSuppressed(r, blocked),
    };
  });
  const dayAgo = new Date(now.getTime() - WARM_FRESH_MS);
  const [pages] = await sql<{ n: number }[]>`
    select count(*)::int as n from practice_os.referral_fetch_cache
     where left(url, ${NPPES_KEY_PREFIX.length}) = ${NPPES_KEY_PREFIX} and status = 200 and fetched_at >= ${dayAgo}`;
  const [warm] = await sql<{ at: Date | null }[]>`select max(at) as at from practice_os.audit_log where action = 'demo_warmed'`;
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
    now,
    dryRunFiles: opts.dryRunFiles ?? (await readDryRunFiles(opts.envDir)),
    niche: settings?.niche_preset ?? null,
    approvalMode: mode?.approval_mode ?? null,
    latestChat: chat ? { mode: chat.approval_mode } : null,
    cards,
    nppesPagesLastDay: pages?.n ?? 0,
    lastWarm: warm?.at ?? null,
    lastReset: at,
    beforeReset: { conversations: await count("conversations", true), approvals: await count("approvals", true) },
    sinceReset: { conversations: await count("conversations", false), approvals: await count("approvals", false) },
  };
}

export async function checkDemo(opts: {
  url: string;
  expectedRef?: string;
  envDir?: string;
  /** Gives up with checkTimeoutMessage() after this long (default CHECK_TIMEOUT_MS). */
  timeoutMs?: number;
  /** The database client; tests pass their own. Default: poolerSafeClient (no pipelining, see lib/db.ts). */
  client?: (url: string) => postgres.Sql;
}): Promise<CheckLine[]> {
  const refusal = checkRefusal(opts.url, opts.expectedRef ?? process.env.SUPABASE_PROJECT_REF);
  if (refusal) throw new Error(refusal);
  // max_pipeline: 0 matters here: suppressedList() reads two tables at once, and on one
  // connection postgres.js would pipeline the second read behind the first. Supabase's
  // transaction pooler hands the server connection back after the first reply, so the
  // second never came and demo:check hung forever, printing nothing.
  const sql = (opts.client ?? ((url: string) => poolerSafeClient(url, { max: 1 })))(opts.url);
  const ms = opts.timeoutMs ?? CHECK_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const snapshot = loadDemoSnapshot(sql, { envDir: opts.envDir });
  snapshot.catch(() => {}); // after a timeout its rejection (the closed connection) is not news
  try {
    const s = await Promise.race([
      snapshot,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(checkTimeoutMessage(ms)));
        }, ms);
      }),
    ]);
    return evaluateDemo(s);
  } finally {
    clearTimeout(timer);
    // After a timeout, drop the stuck connection at once instead of waiting on it.
    await sql.end({ timeout: timedOut ? 0 : 5 });
  }
}
