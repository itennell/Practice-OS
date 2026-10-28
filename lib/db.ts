import postgres from "postgres";
import { requireEnv } from "./env";

let client: postgres.Sql | null = null;

// One shared connection pool to DATABASE_URL: Supabase's pooler, or the
// built-in database, whose URL prepareDatabase() (lib/local-db.ts) sets at start.
// prepare: false is required by the transaction pooler.
export function db(): postgres.Sql {
  client ??= postgres(requireEnv("DATABASE_URL"), { max: 5, prepare: false, onnotice: () => {} });
  return client;
}

export async function closeDb(): Promise<void> {
  await client?.end({ timeout: 5 });
  client = null;
}
