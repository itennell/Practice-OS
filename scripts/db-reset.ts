import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { loadEnv, requireEnv } from "../lib/env";
import { prepareDatabase } from "../lib/local-db";
import { danaFacts } from "../lib/compliance/demo";
import { practiceToday, syncCalendar } from "../lib/compliance/store";
import { SEED_POSTS } from "./seed-posts";

// npm run db:reset: empties the demo-data tables and reseeds the fictional
// Dana Reyes practice. Never touches settings, connections, audit_log,
// model_calls or any schema other than practice_os.
loadEnv();

export const DEMO_TABLES = [
  "clinician_profile",
  "approvals",
  "good_faith_estimates",
  "superbills",
  "credentialing_profile",
  "payer_applications",
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
] as const;

// Without DATABASE_URL this is the built-in database, which reports as project "local".
const url = new URL((await prepareDatabase()).url);
const isLocalHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
const ref = url.username.split(".")[1] ?? (isLocalHost ? "local" : url.hostname.split(".")[1]);
const expected = requireEnv("SUPABASE_PROJECT_REF");
if (ref !== expected) {
  console.error(`Refusing to reset: DATABASE_URL points at project "${ref}", not SUPABASE_PROJECT_REF "${expected}".`);
  process.exit(1);
}

const sql = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });
try {
  const [migrated] = await sql`
    select to_regclass('practice_os.schema_migrations') is not null
      and exists (select 1 from practice_os.schema_migrations where name = '001_init.sql') as ok
  `;
  if (!migrated?.ok) throw new Error("Run `npm run db:migrate` first.");

  const seed = await readFile("db/seed/demo.sql", "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(`truncate ${DEMO_TABLES.map((t) => `practice_os.${t}`).join(", ")}`);
    await tx.unsafe(seed);
    // The [Sample] posts' finished pictures, so the demo post can be approved.
    for (const post of SEED_POSTS) {
      if (!post.picture) continue;
      const jpeg = await readFile(`db/seed/posts/${post.id}.jpg`);
      await tx`update practice_os.posts set image_jpeg = ${jpeg}, alt_text = ${`[Sample] Picture with the words: ${post.headline}`} where id = ${post.id}`;
    }
  });

  // Dana's practice facts, then her calendar built from the rules.
  const today = await practiceToday(sql);
  // State and credential live on clinician_profile; city goes in as city_code.
  const facts: Record<string, unknown> = { ...danaFacts(today) };
  facts.city_code = facts.city;
  for (const key of ["practice_state", "credential", "city"]) delete facts[key];
  await sql`insert into practice_os.compliance_facts ${sql(facts as never)}`;
  const cal = await syncCalendar(sql, { today });
  console.log(`Calendar for ${today}: ${cal.written} obligations from the rules.`);

  console.log("Reset done. Row counts:");
  for (const table of ALL_TABLES) {
    const [{ n }] = await sql.unsafe(`select count(*)::int as n from practice_os.${table}`);
    console.log(`  ${table.padEnd(18)} ${n}`);
  }
} finally {
  await sql.end();
}
