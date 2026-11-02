import postgres from "postgres";
import { ALL_TABLES, resetDemoData } from "../lib/demo-reset";
import { loadEnv, requireEnv } from "../lib/env";
import { prepareDatabase } from "../lib/local-db";

// npm run db:reset: empties the demo-data tables (and the files of the documents
// testers added) and reseeds the fictional Dana Reyes practice (lib/demo-reset.ts).
// Never touches settings, connections, audit_log (it only adds one demo_reset row),
// model_calls or any schema other than practice_os.
loadEnv();

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
  const result = await resetDemoData(sql);
  console.log(`Calendar for ${result.today}: ${result.obligations} obligations from the rules.`);
  console.log(`Removed ${result.removedFiles.documents} document files and ${result.removedFiles.inbox} inbox files.`);
  console.log("Reset done. Row counts:");
  for (const table of ALL_TABLES) {
    const [{ n }] = await sql.unsafe(`select count(*)::int as n from practice_os.${table}`);
    console.log(`  ${table.padEnd(22)} ${n}`);
  }
} finally {
  await sql.end();
}
