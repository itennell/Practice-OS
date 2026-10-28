import { loadEnv } from "../lib/env";
import { prepareDatabase } from "../lib/local-db";
import { runMigrations } from "../lib/migrations";

// npm run db:migrate: runs pending db/migrations against DATABASE_URL, or
// against the built-in database when DATABASE_URL is not set.
loadEnv();

const { url } = await prepareDatabase({ migrate: false });
const ran = await runMigrations(url, { log: console.log });
if (ran.length === 0) console.log("No migrations to run.");
