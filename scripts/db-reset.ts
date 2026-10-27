import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { loadEnv, requireEnv } from "../lib/env";
import { danaFacts } from "../lib/compliance/demo";
import { practiceToday, syncCalendar } from "../lib/compliance/store";

// npm run db:reset: empties the demo-data tables and reseeds the fictional
// Dana Reyes practice. Never touches settings, connections, audit_log,
// model_calls or any schema other than practice_os.
loadEnv();

export const DEMO_TABLES = [
  "clinician_profile",
  "approvals",
  "good_faith_estimates",
  "credentialing_profile",
  "obligations",
  "compliance_facts",
  "compliance_rules",
  "referral_sources",
  "posts",
  "inquiries",
  "messages",
  "consult_bookings",
  "faqs",
  "alerts",
  "memories",
  "chat_messages",
  "conversations",
] as const;

export const ALL_TABLES = [
  ...DEMO_TABLES,
  "settings",
  "connections",
  "audit_log",
  "model_calls",
] as const;

const url = new URL(requireEnv("DATABASE_URL"));
const ref = url.username.split(".")[1] ?? url.hostname.split(".")[1];
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
