import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

// Vitest global setup. Tests use a throwaway built-in database unless
// DATABASE_URL is exported in the shell (a .env file alone doesn't count), so
// `npm test` never resets or writes to a shared database by accident.
// The folder is deleted afterwards.

let dir: string | null = null;

/** Test runs that were killed leave their folders, and sometimes a running Postgres, behind. Clear those over an hour old. */
async function sweepOldRuns() {
  const { stopLocalDatabase } = await import("../../lib/local-db");
  const tmp = os.tmpdir();
  for (const name of await readdir(tmp)) {
    if (!name.startsWith("practice-os-test-") && !name.startsWith("practice-os-localdb-")) continue;
    const folder = path.join(tmp, name);
    const info = await stat(folder).catch(() => null);
    if (!info?.isDirectory() || Date.now() - info.mtimeMs < 3_600_000) continue;
    await stopLocalDatabase(folder).catch(() => {});
    await rm(folder, { recursive: true, force: true }).catch(() => {});
  }
}

export async function setup() {
  if (process.env.DATABASE_URL) return;
  await sweepOldRuns();
  dir = await mkdtemp(path.join(os.tmpdir(), "practice-os-test-"));
  process.env.PRACTICE_OS_DATA_DIR = dir;
  const { prepareDatabase } = await import("../../lib/local-db");
  const { runMigrations } = await import("../../lib/migrations");
  const { url } = await prepareDatabase({ dir, migrate: false });

  // tests/db.test.ts checks that Supabase's API roles can't read anything. Set them up the way
  // a Supabase project has them BEFORE migrating, so the revokes in the migrations really run:
  // the roles exist, and anything new in a schema the API can see is granted to them by default.
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  for (const role of ["anon", "authenticated", "service_role"]) {
    await sql.unsafe(`do $$ begin create role ${role} nologin; exception when duplicate_object then null; end $$`);
  }
  await sql.unsafe("grant usage on schema public to anon, authenticated, service_role");
  await sql.unsafe("alter default privileges in schema public grant all on tables to anon, authenticated, service_role");
  // As if practice_os had been exposed to the API too: migration 001 must take all of this back.
  await sql.unsafe("create schema if not exists practice_os");
  await sql.unsafe("grant usage on schema practice_os to anon, authenticated");
  await sql.unsafe("alter default privileges in schema practice_os grant all on tables to anon, authenticated");
  await sql.end();
  await runMigrations(url);

  // Dana's fictional demo practice, as `npm run db:reset` seeds it.
  execFileSync("npx", ["tsx", "scripts/db-reset.ts"], {
    env: { ...process.env, DATABASE_URL: url, SUPABASE_PROJECT_REF: "local" },
    stdio: "ignore",
  });
}

export async function teardown() {
  if (!dir) return;
  const { stopLocalDatabase } = await import("../../lib/local-db");
  await stopLocalDatabase(dir).catch((err) => console.warn(`Couldn't stop the test database: ${err}`));
  await rm(dir, { recursive: true, force: true });
}
