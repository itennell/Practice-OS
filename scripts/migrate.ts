import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { loadEnv, requireEnv } from "../lib/env";

// Runs db/migrations/*.sql in name order, once each, inside schema practice_os.
// Applied files are recorded in practice_os.schema_migrations.
loadEnv();

const dir = path.join(process.cwd(), "db", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

if (files.length === 0) {
  console.log("No migrations to run.");
  process.exit(0);
}

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });

try {
  await sql`create schema if not exists practice_os`;
  await sql`
    create table if not exists practice_os.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;
  await sql`alter table practice_os.schema_migrations enable row level security`;

  const done = new Set(
    (await sql`select name from practice_os.schema_migrations`).map((r) => r.name as string),
  );

  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into practice_os.schema_migrations (name) values (${file})`;
    });
    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end();
}
