import { loadEnv } from "../lib/env";
import { migrateWithBackup, prepareDatabase } from "../lib/local-db";
import { pendingMigrations, runMigrations } from "../lib/migrations";

// npm run db:migrate: runs pending db/migrations against DATABASE_URL, or
// against the built-in database when DATABASE_URL is not set. The built-in
// database is backed up first, the same as when the app starts.
loadEnv();

const { url, local } = await prepareDatabase({ migrate: false });
if ((await pendingMigrations(url)).length === 0) {
  console.log("No migrations to run.");
} else if (local) {
  const backup = await migrateWithBackup(url, undefined, console.log);
  if (backup) console.log(`Backed up first to ${backup}`);
} else {
  await runMigrations(url, { log: console.log });
}
