import postgres from "postgres";
import { builtInDatabaseUrl } from "./local-db-url";

let client: postgres.Sql | null = null;

// One shared connection pool to DATABASE_URL: Supabase's pooler, or the
// built-in database, whose URL prepareDatabase() (lib/local-db.ts) sets at start.
// prepare: false is required by the transaction pooler.
//
// max_pipeline: 0 sends one query per connection at a time. By default postgres.js
// pipelines more queries behind a running one once every connection is busy (a page
// that reads many things at once). Supabase's transaction pooler hands the server
// connection back as soon as the first query finishes and the reply to the one queued
// behind it never arrives: the page hangs and that server connection sits waiting
// until statement_timeout. postgres.js types leave max_pipeline out, hence the cast.
//
// With max_pipeline: 0 postgres.js's own sql.begin refuses to start (it reserves its
// connection only when pipelining is allowed), so begin() below runs the transaction
// on a reserved connection instead. Same call shape: db().begin([mode,] async (tx) => ...).
export function db(): postgres.Sql {
  if (!client) {
    // A script or helper started without DATABASE_URL joins the built-in database the app is running.
    const url = process.env.DATABASE_URL || builtInDatabaseUrl();
    if (!url) throw new Error("DATABASE_URL is not set and the built-in database hasn't been started (run npm run dev or npm run db:migrate).");
    const options = { max: 5, prepare: false, max_pipeline: 0, onnotice: () => {} } as postgres.Options<{}>;
    const sql = postgres(url, options);
    sql.begin = begin.bind(null, sql) as postgres.Sql["begin"];
    client = sql;
  }
  return client;
}

type TxFn = (tx: postgres.TransactionSql) => unknown;

async function begin(sql: postgres.Sql, modeOrFn: string | TxFn, maybeFn?: TxFn): Promise<unknown> {
  const fn = (typeof modeOrFn === "function" ? modeOrFn : maybeFn) as TxFn;
  const mode = typeof modeOrFn === "string" ? modeOrFn.replace(/[^a-z ]/gi, "") : "";
  const tx = await sql.reserve();
  try {
    await tx.unsafe(`begin ${mode}`);
    try {
      const out = fn(tx as unknown as postgres.TransactionSql);
      const result = await (Array.isArray(out) ? Promise.all(out) : out);
      await tx`commit`;
      return result;
    } catch (e) {
      await tx`rollback`.catch(() => {});
      throw e;
    }
  } finally {
    tx.release();
  }
}

export async function closeDb(): Promise<void> {
  await client?.end({ timeout: 5 });
  client = null;
}
