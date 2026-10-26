import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { loadEnv, requireEnv } from "../lib/env";

// Runs db/migrations/*.sql in name order, once each, inside schema practice_os.
// Applied files are recorded with a checksum in practice_os.schema_migrations;
// a migration that was edited after it ran stops the runner.
loadEnv();

const dir = path.join(process.cwd(), "db", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

if (files.length === 0) {
  console.log("No migrations to run.");
  process.exit(0);
}

const sql = postgres(requireEnv("DATABASE_URL"), { max: 1, prepare: false, onnotice: () => {} });

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

  let ran = 0;
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
    console.log(`Applied ${file}`);
    ran += 1;
  }
  if (ran === 0) console.log("No migrations to run.");
} finally {
  await sql.end();
}
