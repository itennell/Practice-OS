import { loadEnv } from "../lib/env";
import { pendingMigrations } from "../lib/migrations";

// Called by check-install.mjs. A database set in .env (Supabase) is never migrated
// automatically, so say when it is behind. The built-in database migrates itself on
// start. Only a warning: migrating the shared database needs Isaiah's OK.
loadEnv();
const url = process.env.DATABASE_URL;
if (url) {
  const pending = await Promise.race([
    pendingMigrations(url).catch(() => null),
    new Promise<null>((done) => setTimeout(() => done(null), 5000).unref()),
  ]);
  if (pending?.length) {
    console.warn(
      `Heads up: the database in .env is missing ${pending.length} update${pending.length === 1 ? "" : "s"} (${pending.join(", ")}).\n` +
        "Pages that use them will fail until `npm run db:migrate` runs. Ask before migrating the shared database.",
    );
  }
}
process.exit(0);
