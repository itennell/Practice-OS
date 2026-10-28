import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

// Runs db/migrations/*.sql in name order, once each, inside schema practice_os.
// Applied files are recorded with a checksum in practice_os.schema_migrations;
// a migration that was edited after it ran stops the runner.

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

export async function migrationFiles(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
}

/** Migration files not yet recorded in schema_migrations (all of them on an empty database). */
export async function pendingMigrations(url: string, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const files = await migrationFiles(dir);
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [{ exists }] = await sql`select to_regclass('practice_os.schema_migrations') is not null as exists`;
    if (!exists) return files;
    const applied = new Set((await sql`select name from practice_os.schema_migrations`).map((r) => r.name as string));
    return files.filter((f) => !applied.has(f));
  } finally {
    await sql.end();
  }
}

type Options = {
  dir?: string;
  /** Stop after this file (inclusive). Tests use it to build an older database and then upgrade it. */
  upTo?: string;
  log?: (line: string) => void;
};

/** Applies every pending migration, each in its own transaction. Returns the files it applied. */
export async function runMigrations(url: string, { dir = MIGRATIONS_DIR, upTo, log = () => {} }: Options = {}): Promise<string[]> {
  const files = (await migrationFiles(dir)).filter((f) => !upTo || f <= upTo);
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const ran: string[] = [];
  try {
    await sql`create schema if not exists practice_os`;
    await sql`
      create table if not exists practice_os.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `;
    await sql`alter table practice_os.schema_migrations enable row level security`;

    const applied = new Map(
      (await sql`select name, checksum from practice_os.schema_migrations`).map((r) => [r.name as string, r.checksum as string]),
    );

    for (const file of files) {
      const body = await readFile(path.join(dir, file), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex");
      const previous = applied.get(file);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(`${file} was changed after it ran. Write a new migration instead of editing it.`);
        }
        continue;
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into practice_os.schema_migrations (name, checksum) values (${file}, ${checksum})`;
      });
      log(`Applied ${file}`);
      ran.push(file);
    }
    return ran;
  } finally {
    await sql.end();
  }
}
