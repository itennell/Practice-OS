import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import postgres from "postgres";

// Backups of the practice_os schema without pg_dump (the built-in Postgres
// doesn't ship it): every table is copied to its own file inside one
// read-only snapshot, so the files agree with each other. A restore runs the
// migrations on an empty database first, then copies the rows back in.
// manifest.json records the migrations and row counts, and restore checks both.

type Query = postgres.Sql | postgres.TransactionSql;

type Manifest = {
  createdAt: string;
  reason: string;
  migrations: string[];
  rows: Record<string, number>;
};

async function practiceTables(sql: Query): Promise<string[]> {
  const rows = await sql`
    select tablename from pg_tables
    where schemaname = 'practice_os' and tablename <> 'schema_migrations'
    order by tablename
  `;
  return rows.map((r) => r.tablename as string);
}

async function rowCounts(sql: Query, tables: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of tables) counts[t] = (await sql.unsafe(`select count(*)::int as n from practice_os."${t}"`))[0].n;
  return counts;
}

/** Copies every practice_os table into `dir` (created). Returns the manifest it wrote. */
export async function backupDatabase(url: string, dir: string, reason: string): Promise<Manifest> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await sql.begin("isolation level repeatable read read only", async (tx) => {
      const tables = await practiceTables(tx);
      for (const t of tables) {
        const source = await tx.unsafe(`copy practice_os."${t}" to stdout`).readable();
        await pipeline(source, createWriteStream(path.join(dir, `${t}.copy`), { mode: 0o600 }));
      }
      const migrations = (await tx`select name from practice_os.schema_migrations order by name`).map((r) => r.name as string);
      const manifest: Manifest = { createdAt: new Date().toISOString(), reason, migrations, rows: await rowCounts(tx, tables) };
      await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
      return manifest;
    });
  } finally {
    await sql.end();
  }
}

/**
 * Loads a backup into a database that has the same migrations applied and no
 * practice rows yet. Throws, leaving the database unchanged, if anything
 * doesn't match.
 */
export async function restoreDatabase(url: string, dir: string): Promise<Manifest> {
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      const migrations = (await tx`select name from practice_os.schema_migrations order by name`).map((r) => r.name as string);
      if (migrations.join() !== manifest.migrations.join()) {
        throw new Error("This backup was made with a different version of Practice-OS. Run the same migrations first.");
      }
      const tables = Object.keys(manifest.rows);
      const existing = await rowCounts(tx, tables);
      if (Object.values(existing).some((n) => n > 0)) throw new Error("Restore needs an empty practice database.");

      // Rows go back in any order: skip foreign-key and trigger checks for this transaction only.
      await tx.unsafe("set local session_replication_role = replica");
      for (const t of tables) {
        const target = await tx.unsafe(`copy practice_os."${t}" from stdin`).writable();
        await pipeline(createReadStream(path.join(dir, `${t}.copy`)), target);
      }
      // Identity columns continue after the highest restored id.
      const identities = await tx`
        select c.relname as t, a.attname as col
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'practice_os' and a.attidentity <> '' and not a.attisdropped
      `;
      for (const { t, col } of identities) {
        await tx.unsafe(
          `select setval(pg_get_serial_sequence('practice_os."${t}"', '${col}'),
                         coalesce((select max("${col}") from practice_os."${t}"), 0) + 1, false)`,
        );
      }
      const restored = await rowCounts(tx, tables);
      const wrong = tables.filter((t) => restored[t] !== manifest.rows[t]);
      if (wrong.length > 0) throw new Error(`Restore row counts don't match for: ${wrong.join(", ")}`);
    });
    return manifest;
  } finally {
    await sql.end();
  }
}

/** Keeps the newest `keep` backup folders in `root` and deletes the rest. */
export async function pruneBackups(root: string, keep: number): Promise<void> {
  const folders = (await readdir(root, { withFileTypes: true }).catch(() => []))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const name of folders.slice(0, Math.max(0, folders.length - keep))) {
    await rm(path.join(root, name), { recursive: true, force: true });
  }
}
