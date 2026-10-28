import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

// Vitest global setup. Tests use a throwaway built-in database unless
// DATABASE_URL is exported in the shell (a .env file alone doesn't count), so
// `npm test` never resets or writes to a shared database by accident.
// The folder is deleted afterwards.

let dir: string | null = null;

export async function setup() {
  if (process.env.DATABASE_URL) return;
  dir = await mkdtemp(path.join(os.tmpdir(), "practice-os-test-"));
  process.env.PRACTICE_OS_DATA_DIR = dir;
  const { prepareDatabase } = await import("../../lib/local-db");
  const { url } = await prepareDatabase({ dir });

  // tests/db.test.ts checks that Supabase's API roles can't read anything; give them something to check.
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  for (const role of ["anon", "authenticated", "service_role"]) {
    await sql.unsafe(`do $$ begin create role ${role} nologin; exception when duplicate_object then null; end $$`);
  }
  await sql.end();

  // Dana's fictional demo practice, as `npm run db:reset` seeds it.
  execFileSync("npx", ["tsx", "scripts/db-reset.ts"], {
    env: { ...process.env, DATABASE_URL: url, SUPABASE_PROJECT_REF: "local" },
    stdio: "ignore",
  });
}

export async function teardown() {
  if (!dir) return;
  const { stopLocalDatabase } = await import("../../lib/local-db");
  await stopLocalDatabase(dir);
  await rm(dir, { recursive: true, force: true });
}
