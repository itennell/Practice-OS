import postgres from "postgres";
import { builtInDatabaseUrl } from "./local-db-url";

let client: postgres.Sql | null = null;

// One shared connection pool to DATABASE_URL: Supabase's pooler, or the
// built-in database, whose URL prepareDatabase() (lib/local-db.ts) sets at start.
// prepare: false is required by the transaction pooler.
export function db(): postgres.Sql {
  if (!client) {
    // A script or helper started without DATABASE_URL joins the built-in database the app is running.
    const url = process.env.DATABASE_URL || builtInDatabaseUrl();
    if (!url) throw new Error("DATABASE_URL is not set and the built-in database hasn't been started (run npm run dev or npm run db:migrate).");
    client = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
  }
  return client;
}

export async function closeDb(): Promise<void> {
  await client?.end({ timeout: 5 });
  client = null;
}
