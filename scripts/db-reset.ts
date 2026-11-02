import postgres from "postgres";
import { ALL_TABLES, resetDemoData, resetRefusal } from "../lib/demo-reset";
import { loadEnv } from "../lib/env";
import { prepareDatabase } from "../lib/local-db";

// npm run db:reset: empties the demo-data tables (and the files of the documents
// testers added) and reseeds the fictional Dana Reyes practice (lib/demo-reset.ts).
// Never touches settings, connections, audit_log (it only adds one demo_reset row),
// model_calls or any schema other than practice_os.
loadEnv();

// Without DATABASE_URL this is the built-in database, which reports as project "local".
const { url } = await prepareDatabase();
// resetDemoData checks this too; checked here first so nothing is opened on a refusal.
const refusal = resetRefusal(url, process.env.SUPABASE_PROJECT_REF);
if (refusal) {
  console.error(refusal);
  process.exit(1);
}

const result = await resetDemoData({ url });
console.log(`Calendar for ${result.today}: ${result.obligations} obligations from the rules.`);
console.log(`Removed ${result.removedFiles.documents} document files and ${result.removedFiles.inbox} inbox files.`);
console.log(`${result.clearedCrisisAlerts} earlier crisis alerts were cleared from Admin.`);
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  console.log("Reset done. Row counts:");
  for (const table of ALL_TABLES) {
    const [{ n }] = await sql.unsafe(`select count(*)::int as n from practice_os.${table}`);
    console.log(`  ${table.padEnd(22)} ${n}`);
  }
} finally {
  await sql.end();
}
