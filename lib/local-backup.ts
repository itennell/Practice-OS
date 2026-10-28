import { createCipheriv, createDecipheriv, randomBytes, type Decipher } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, open, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import postgres from "postgres";

// Backups of the practice_os schema without pg_dump (the built-in Postgres
// doesn't ship it): every table is copied to its own file inside one
// read-only snapshot, so the files agree with each other. A restore runs the
// migrations on an empty database first, then copies the rows back in.
// manifest.json records the migrations and row counts, and restore checks both.
//
// Each table file is encrypted with AES-256-GCM under the backup key
// (BACKUP_ENCRYPTION_KEY, kept in secrets.json for now; phase 2 moves it to the
// OS keychain). File layout: 12-byte IV, ciphertext, 16-byte auth tag. The
// table name goes in as associated data, so one table's file can't pass for another's.
// manifest.json stays readable and holds no practice data, only names and counts.

const IV_BYTES = 12;
const TAG_BYTES = 16;

type Query = postgres.Sql | postgres.TransactionSql;

type Manifest = {
  createdAt: string;
  encryption: "aes-256-gcm";
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

function checkKey(key: Buffer) {
  if (key.length !== 32) throw new Error("The backup key must be 32 bytes.");
}

/** Copies every practice_os table into `dir` (created), encrypted with `key`. Returns the manifest it wrote. */
export async function backupDatabase(url: string, dir: string, reason: string, key: Buffer): Promise<Manifest> {
  checkKey(key);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await sql.begin("isolation level repeatable read read only", async (tx) => {
      const tables = await practiceTables(tx);
      for (const t of tables) {
        const file = path.join(dir, `${t}.copy.enc`);
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv("aes-256-gcm", key, iv).setAAD(Buffer.from(t));
        await writeFile(file, iv, { mode: 0o600 });
        const source = await tx.unsafe(`copy practice_os."${t}" to stdout`).readable();
        await pipeline(source, cipher, createWriteStream(file, { flags: "a" }));
        await appendFile(file, cipher.getAuthTag());
      }
      const migrations = (await tx`select name from practice_os.schema_migrations order by name`).map((r) => r.name as string);
      const manifest: Manifest = {
        createdAt: new Date().toISOString(),
        encryption: "aes-256-gcm",
        reason,
        migrations,
        rows: await rowCounts(tx, tables),
      };
      await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
      return manifest;
    });
  } finally {
    await sql.end();
  }
}

/** Streams one table file's rows back out, decrypted. The auth tag is checked when the stream ends. */
async function decryptedRows(file: string, table: string, key: Buffer): Promise<[Readable, Decipher]> {
  const handle = await open(file, "r");
  const iv = Buffer.alloc(IV_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  let size: number;
  try {
    size = (await handle.stat()).size;
    await handle.read(iv, 0, IV_BYTES, 0);
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv).setAAD(Buffer.from(table)).setAuthTag(tag);
  const body = size > IV_BYTES + TAG_BYTES ? createReadStream(file, { start: IV_BYTES, end: size - TAG_BYTES - 1 }) : Readable.from([]);
  return [body, decipher];
}

/**
 * Loads a backup into a database that has the same migrations applied and no
 * practice rows yet. Throws, leaving the database unchanged, if anything
 * doesn't match, a wrong key or a damaged file included.
 */
export async function restoreDatabase(url: string, dir: string, key: Buffer): Promise<Manifest> {
  checkKey(key);
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
        const [body, decipher] = await decryptedRows(path.join(dir, `${t}.copy.enc`), t, key);
        const target = await tx.unsafe(`copy practice_os."${t}" from stdin`).writable();
        // Rows stream in as they decrypt; a bad tag at the end throws, and the whole transaction rolls back.
        await pipeline(body, decipher, target).catch((err) => {
          if (/authenticate/.test(String(err))) throw new Error(`This backup can't be opened with this key, or ${t} is damaged.`);
          throw err;
        });
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
