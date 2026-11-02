import { readFile } from "node:fs/promises";
import type postgres from "postgres";
import { danaFacts } from "./compliance/demo";
import { practiceToday, syncCalendar } from "./compliance/store";
import { removeDocumentFiles, type RemovedDocument } from "./uploads/cleanup";
import { dataDir } from "./uploads/store";
import { SEED_POSTS } from "../scripts/seed-posts";

// What `npm run db:reset` (scripts/db-reset.ts) does once it has checked which
// database it is on: empties the demo-data tables, reseeds the fictional Dana
// Reyes practice, removes the files of the documents it emptied, and writes one
// `demo_reset` audit row. Never touches settings, connections, audit_log
// (append-only; it only adds that row), model_calls or any schema other than
// practice_os.

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
  // Her own choices, seeded only when missing (014, 034); never reset.
  "referral_settings",
  "client_form_templates",
] as const;

export type ResetResult = { today: string; obligations: number; removedFiles: { documents: number; inbox: number } };

export async function resetDemoData(sql: postgres.Sql, opts: { dir?: string } = {}): Promise<ResetResult> {
  const [migrated] = await sql`
    select to_regclass('practice_os.schema_migrations') is not null
      and exists (select 1 from practice_os.schema_migrations where name = '001_init.sql') as ok
  `;
  if (!migrated?.ok) throw new Error("Run `npm run db:migrate` first.");

  const seed = await readFile("db/seed/demo.sql", "utf8");
  let removed: RemovedDocument[] = [];
  await sql.begin(async (tx) => {
    removed = await tx<RemovedDocument[]>`select stored_as, sha256 from practice_os.documents`;
    await tx.unsafe(`truncate ${DEMO_TABLES.map((t) => `practice_os.${t}`).join(", ")}`);
    await tx.unsafe(seed);
    // The [Sample] posts' finished pictures, so the demo post can be approved.
    for (const post of SEED_POSTS) {
      if (!post.picture) continue;
      const jpeg = await readFile(`db/seed/posts/${post.id}.jpg`);
      await tx`update practice_os.posts set image_jpeg = ${jpeg}, alt_text = ${`[Sample] Picture with the words: ${post.headline}`} where id = ${post.id}`;
    }
  });
  // Only after the rows are gone for good: a failed reset keeps every file.
  const removedFiles = await removeDocumentFiles(removed, opts.dir ?? dataDir());

  // Dana's practice facts, then her calendar built from the rules.
  const today = await practiceToday(sql);
  // State and credential live on clinician_profile; city goes in as city_code.
  const facts: Record<string, unknown> = { ...danaFacts(today) };
  facts.city_code = facts.city;
  for (const key of ["practice_state", "credential", "city"]) delete facts[key];
  await sql`insert into practice_os.compliance_facts ${sql(facts as never)}`;
  const cal = await syncCalendar(sql, { today });

  // Anything that happened before this (a tester's crisis probe on Admin) is old demo noise.
  await sql`
    insert into practice_os.audit_log (actor, action, subject_type, details)
    values ('db:reset', 'demo_reset', 'demo', ${sql.json({ documents: removed.length, files: removedFiles } as never)})`;
  return { today, obligations: cal.written, removedFiles };
}
