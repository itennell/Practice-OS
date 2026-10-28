import { readFileSync } from "node:fs";
import path from "node:path";

// The built-in database's address, read from its data folder without starting
// anything. Lets any script or test helper that only calls db() reach the
// database the app (or prepareDatabase) already started. Kept apart from
// lib/local-db.ts so lib/db.ts doesn't pull the Postgres tooling into every bundle.

export function builtInDatabaseUrl(): string | null {
  if (process.env.VERCEL) return null;
  const dir = process.env.PRACTICE_OS_DATA_DIR || path.join(process.cwd(), ".data"); // same folder as lib/local-db.ts dataDir()
  try {
    const c = JSON.parse(readFileSync(path.join(dir, "local-db.json"), "utf8")) as { port: number; user: string; password: string; database: string };
    return `postgres://${c.user}:${encodeURIComponent(c.password)}@127.0.0.1:${c.port}/${c.database}`;
  } catch {
    return null;
  }
}
