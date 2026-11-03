import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { loadAlertFailures } from "./admin/load";
import { danaFacts } from "./compliance/demo";
import { practiceToday, syncCalendar } from "./compliance/store";
import { removeDocumentFiles, type RemovedDocument } from "./uploads/cleanup";
import { dataDir } from "./uploads/store";
import { SEED_POSTS } from "../scripts/seed-posts";
import { specialtiesForNiche } from "./referrals/settings";

/** The fictional demo practice's niche: oncology / serious illness / end of life, and that niche's kinds. */
export const DEMO_NICHE = "oncology_serious_illness";
/** Her office ZIP (Lincoln Park, Chicago): the demo searches around it. */
export const DEMO_ZIP = "60614";
export const DEMO_REFERRAL_KINDS: string[] = specialtiesForNiche(DEMO_NICHE);

// What `npm run db:reset` (scripts/db-reset.ts) does once it has checked which
// database it is on: empties the demo-data tables, reseeds the fictional Dana
// Reyes practice, removes the files of the documents it emptied, and writes one
// `demo_reset` audit row. It also sets Dana's demo niche, its kinds and home ZIP
// in referral_settings (her own choices otherwise; on the fictional demo practice
// they are demo data). Never touches settings, connections, audit_log
// (append-only; it only adds that row), model_calls, the do-not-contact lists,
// referral_fetch_cache or any schema other than practice_os.

export const DEMO_TABLES = [
  "clinician_profile",
  "approvals",
  "good_faith_estimates",
  "superbills",
  "credentialing_profile",
  "payer_applications",
  // Insurance checklists (032)
  "payer_steps",
  "obligations",
  "compliance_facts",
  "compliance_rules",
  "referral_sources",
  // Referrals v2 (023): what each source said about a card.
  "referral_facts",
  // Referrals v2 (024): the contact log.
  "referral_contacts",
  // Referrals calendar (047): planned coffees, calls and talks.
  "referral_meetings",
  "posts",
  // Instagram studio (021)
  "post_research",
  // Chat-first studio (026-028)
  "studio_projects",
  "studio_steps",
  "studio_pictures",
  // Grow (042)
  "growth_drafts",
  "inquiries",
  "messages",
  "consult_bookings",
  "faqs",
  "alerts",
  "memories",
  "chat_messages",
  "conversations",
  // Front Desk (016)
  "consult_offers",
  // Chat documents (018): testers' uploads; their files go too (lib/uploads/cleanup.ts).
  "documents",
] as const;

export const ALL_TABLES = [
  ...DEMO_TABLES,
  "settings",
  "connections",
  "audit_log",
  "model_calls",
  // Front Desk (016): her callers' STOP list and where each phone stream was read; never reset.
  "sms_opt_outs",
  "front_desk_sync",
  // Referrals v2 (023): cached outside answers and robots.txt; not demo data.
  "referral_fetch_cache",
  // Referrals v2 (025): do-not-contact NPIs; never reset.
  "referral_suppressions",
  // Referrals discovery (045): do-not-contact organisations (no NPI); never reset.
  "referral_suppressions_org",
  // Her own choices, seeded only when missing (014, 034); never reset.
  "referral_settings",
  "client_form_templates",
] as const;

export type ResetResult = {
  today: string;
  obligations: number;
  removedFiles: { documents: number; inbox: number };
  /** Crisis alerts Admin showed before the reset; the reset hides them (lib/admin/load.ts). */
  clearedCrisisAlerts: number;
};

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const SUPABASE_HOST = /(?:^|\.)(?:supabase\.co|pooler\.supabase\.com)$/i;

/**
 * Which project a database URL belongs to. "local": the built-in database, only on
 * 127.0.0.1 or localhost (a "postgres" or "postgres.local" user). A Supabase ref: the
 * pooler user "postgres.<ref>" or the direct host "db.<ref>.supabase.co", only on a
 * *.supabase.co or *.pooler.supabase.com host. Anything else is null: no reset runs there.
 */
export function projectRefOf(databaseUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const userRef = url.username.split(".")[1] || null;
  if (LOCAL_HOSTS.has(host)) return !userRef || userRef === "local" ? "local" : null;
  if (!SUPABASE_HOST.test(host)) return null;
  if (userRef) return userRef === "local" ? null : userRef;
  const direct = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  return direct?.[1] ?? null;
}

/** Why a reset must not run against this URL, or null when it may. The project must equal SUPABASE_PROJECT_REF. */
export function resetRefusal(databaseUrl: string, expectedRef: string | undefined): string | null {
  if (!expectedRef) return "Refusing to reset: SUPABASE_PROJECT_REF is not set (use \"local\" for the built-in database).";
  const ref = projectRefOf(databaseUrl);
  if (ref !== expectedRef) return `Refusing to reset: DATABASE_URL points at project "${ref}", not SUPABASE_PROJECT_REF "${expectedRef}".`;
  return null;
}

/**
 * Resets the demo practice on the database at `url`. Every caller goes through the
 * project check first, so nothing can reset a database it didn't name in SUPABASE_PROJECT_REF.
 */
export async function resetDemoData(opts: { url: string; expectedRef?: string; dir?: string }): Promise<ResetResult> {
  const refusal = resetRefusal(opts.url, opts.expectedRef ?? process.env.SUPABASE_PROJECT_REF);
  if (refusal) throw new Error(refusal);

  const sql = postgres(opts.url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await reset(sql, opts.dir ?? dataDir());
  } finally {
    await sql.end();
  }
}

async function reset(sql: postgres.Sql, dir: string): Promise<ResetResult> {
  const [migrated] = await sql`
    select to_regclass('practice_os.schema_migrations') is not null
      and exists (select 1 from practice_os.schema_migrations where name = '001_init.sql') as ok
  `;
  if (!migrated?.ok) throw new Error("Run `npm run db:migrate` first.");

  const seed = await readFile("db/seed/demo.sql", "utf8");
  let removed: RemovedDocument[] = [];
  await sql.begin(async (tx) => {
    // No upload can land between reading the file list and emptying the table.
    await tx`lock table practice_os.documents in access exclusive mode`;
    removed = await tx<RemovedDocument[]>`select stored_as, sha256 from practice_os.documents`;
    await tx.unsafe(`truncate ${DEMO_TABLES.map((t) => `practice_os.${t}`).join(", ")}`);
    await tx.unsafe(seed);
    // Dana's demo home ZIP, niche and its kinds, every reset. referral_settings is otherwise hers and never
    // reset, but on the fictional demo practice these are demo data: the demo leads with them.
    await tx`
      insert into practice_os.referral_settings (id, home_zip, specialties, niche_preset)
      values (true, ${DEMO_ZIP}, ${DEMO_REFERRAL_KINDS}, ${DEMO_NICHE})
      on conflict (id) do update set home_zip = excluded.home_zip, niche_preset = excluded.niche_preset, specialties = excluded.specialties, updated_at = now()`;
    // The [Sample] posts' finished pictures, so the demo post can be approved.
    for (const post of SEED_POSTS) {
      if (!post.picture) continue;
      const jpeg = await readFile(`db/seed/posts/${post.id}.jpg`);
      await tx`update practice_os.posts set image_jpeg = ${jpeg}, alt_text = ${`[Sample] Picture with the words: ${post.headline}`} where id = ${post.id}`;
    }
  });
  // Only after the rows are gone for good: a failed reset keeps every file.
  const removedFiles = await removeDocumentFiles(removed, dir);

  // Dana's practice facts, then her calendar built from the rules.
  const today = await practiceToday(sql);
  // State and credential live on clinician_profile; city goes in as city_code.
  const facts: Record<string, unknown> = { ...danaFacts(today) };
  facts.city_code = facts.city;
  for (const key of ["practice_state", "credential", "city"]) delete facts[key];
  await sql`insert into practice_os.compliance_facts ${sql(facts as never)}`;
  const cal = await syncCalendar(sql, { today });

  // Crisis alerts logged before this (a tester's probe) leave Admin; say how many, so none goes unnoticed.
  const clearedCrisisAlerts = (await loadAlertFailures(sql, 1000)).length;
  await sql`
    insert into practice_os.audit_log (actor, action, subject_type, details)
    values ('db:reset', 'demo_reset', 'demo', ${sql.json({ documents: removed.length, files: removedFiles, cleared_crisis_alerts: clearedCrisisAlerts } as never)})`;
  return { today, obligations: cal.written, removedFiles, clearedCrisisAlerts };
}
