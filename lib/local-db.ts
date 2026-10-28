import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import postgres from "postgres";
import { backupDatabase, pruneBackups } from "./local-backup";
import { pendingMigrations, runMigrations } from "./migrations";

// The built-in database: when DATABASE_URL is not set, Practice-OS runs its own
// Postgres (the official binaries from the embedded-postgres packages) with the
// data in one folder on this computer. Nothing to sign up for, and one
// practice's data never shares a server with another's.
//
// Layout of the data folder (PRACTICE_OS_DATA_DIR, default ./.data):
//   postgres/        the database files
//   local-db.json    port, user and a random password (owner-only file)
//   secrets.json     the generated CONNECTIONS_ENCRYPTION_KEY (owner-only file)
//   backups/         copies taken before every migration
//   postgres.log
//
// Postgres runs as its own process (pg_ctl), so `next dev`, the MCP server and
// scripts can all share it. `npm run db:stop` stops it; the desktop app stops it on quit.

const BACKUPS_KEPT = 14;

type LocalConfig = { port: number; user: string; password: string; database: string };

export function dataDir(): string {
  return process.env.PRACTICE_OS_DATA_DIR || path.join(process.cwd(), ".data");
}

function binary(name: "initdb" | "pg_ctl"): string {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const pkg = `@embedded-postgres/${platform}-${process.arch}`;
  const require = createRequire(path.join(process.cwd(), "package.json"));
  let entry: string;
  try {
    entry = require.resolve(pkg);
  } catch {
    throw new Error(`The built-in database has no Postgres build for ${platform}-${process.arch} (${pkg} is not installed).`);
  }
  return path.join(path.dirname(entry), "..", "native", "bin", name + (process.platform === "win32" ? ".exe" : ""));
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // stdio ignored: pg_ctl leaves Postgres running, and Postgres must not hold our pipes open.
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with code ${code}`))));
  });
}

/** True when a Postgres is running on this data folder (pg_ctl status exits 0; 3 means none). */
function serverRunning(pgdata: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary("pg_ctl"), ["status", "-D", pgdata], { stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code === 0));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function canConnect(url: string): Promise<boolean> {
  const sql = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => {} });
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function toUrl(c: LocalConfig, database = c.database): string {
  return `postgres://${c.user}:${encodeURIComponent(c.password)}@127.0.0.1:${c.port}/${database}`;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

const LOCK_STALE_MS = 300_000;

/** A lock is left behind by a crash when its owner process is gone, or it is older than 5 minutes. */
async function lockIsStale(file: string): Promise<boolean> {
  const age = Date.now() - (await stat(file).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs;
  if (age > LOCK_STALE_MS) return true;
  const pid = Number(await readFile(file, "utf8").catch(() => ""));
  if (!pid) return false; // just created, the owner hasn't written its pid yet
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH"; // EPERM: alive, just not ours
  }
}

/** One starter at a time per data folder (next dev, the MCP server and scripts may start together). */
async function withLock<T>(file: string, work: () => Promise<T>): Promise<T> {
  // A live owner may hold it the full 5 minutes (slow initdb, crash recovery), so wait a little longer.
  const deadline = Date.now() + LOCK_STALE_MS + 30_000;
  for (;;) {
    try {
      const handle = await open(file, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (await lockIsStale(file)) await rm(file, { force: true });
      else if (Date.now() > deadline) throw new Error(`Timed out waiting for ${file}`);
      else await new Promise((r) => setTimeout(r, 200));
    }
  }
  try {
    return await work();
  } finally {
    await rm(file, { force: true });
  }
}

/** Starts the built-in Postgres (creating it the first time) and returns its connection URL. */
export async function startLocalDatabase(dir: string = dataDir()): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return withLock(path.join(dir, "start.lock"), async () => {
    const pgdata = path.join(dir, "postgres");
    const configFile = path.join(dir, "local-db.json");
    let config = await readJson<LocalConfig>(configFile);

    if (!existsSync(path.join(pgdata, "PG_VERSION"))) {
      // First start, or a first start that crashed part way: no database has been made
      // yet (a finished one always has PG_VERSION), so clear what's left and start over.
      // The password is saved before initdb, and the database is built in a side folder
      // and renamed into place last, so a crash never leaves a database nobody can open.
      const building = `${pgdata}.init`;
      await rm(pgdata, { recursive: true, force: true });
      await rm(building, { recursive: true, force: true });
      config = { port: await freePort(), user: "practiceos", password: randomBytes(24).toString("base64url"), database: "practice" };
      await writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
      const pwfile = path.join(dir, "initdb.pw");
      await writeFile(pwfile, config.password, { mode: 0o600 });
      try {
        await run(binary("initdb"), ["-D", building, "-U", config.user, `--pwfile=${pwfile}`, "--auth=scram-sha-256", "-E", "UTF8", "--locale=C"]);
      } finally {
        await rm(pwfile, { force: true });
      }
      // Only this computer can connect, and only over TCP with the password (no socket files).
      await appendFile(path.join(building, "postgresql.conf"), "\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\n");
      await rename(building, pgdata);
    }
    if (!config) throw new Error(`${configFile} is missing, so the built-in database's password is unknown.`);

    if (!(await canConnect(toUrl(config, "postgres")))) {
      if (await serverRunning(pgdata)) {
        // Our own Postgres is up but not answering yet (busy, or recovering after a crash).
        // Never move its port: wait for it, on the port it really listens on (line 4 of postmaster.pid).
        const port = Number((await readFile(path.join(pgdata, "postmaster.pid"), "utf8")).split("\n")[3]);
        if (port && port !== config.port) {
          config.port = port;
          await writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
        }
        const deadline = Date.now() + 30_000;
        while (!(await canConnect(toUrl(config, "postgres")))) {
          if (Date.now() > deadline) throw new Error(`The built-in database is running but not answering. See ${path.join(dir, "postgres.log")}.`);
          await new Promise((r) => setTimeout(r, 500));
        }
      } else {
        // Nothing owns this data folder, so the port is free to move if something else took it.
        if (!(await portIsFree(config.port))) {
          config.port = await freePort();
          await writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
        }
        await run(binary("pg_ctl"), ["start", "-w", "-t", "60", "-D", pgdata, "-l", path.join(dir, "postgres.log"), "-o", `-p ${config.port}`]);
      }
    }

    const admin = postgres(toUrl(config, "postgres"), { max: 1, onnotice: () => {} });
    try {
      const [found] = await admin`select 1 from pg_database where datname = ${config.database}`;
      if (!found) await admin.unsafe(`create database "${config.database}"`);
    } finally {
      await admin.end();
    }
    return toUrl(config);
  });
}

/** Stops the built-in Postgres if it is running (a postmaster.pid left by a crash doesn't count). */
export async function stopLocalDatabase(dir: string = dataDir()): Promise<void> {
  const pgdata = path.join(dir, "postgres");
  if (!existsSync(path.join(pgdata, "postmaster.pid"))) return;
  if (!(await serverRunning(pgdata))) return;
  await run(binary("pg_ctl"), ["stop", "-w", "-m", "fast", "-D", pgdata]);
}

/** Generates CONNECTIONS_ENCRYPTION_KEY once for this data folder when .env doesn't set one. */
export async function ensureLocalSecrets(dir: string = dataDir()): Promise<void> {
  if (process.env.CONNECTIONS_ENCRYPTION_KEY) return;
  const file = path.join(dir, "secrets.json");
  let secrets = await readJson<{ CONNECTIONS_ENCRYPTION_KEY: string }>(file);
  if (!secrets) {
    secrets = { CONNECTIONS_ENCRYPTION_KEY: randomBytes(32).toString("base64") };
    await writeFile(file, JSON.stringify(secrets, null, 2), { mode: 0o600, flag: "wx" }).catch(async (err) => {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      secrets = await readJson(file); // another process wrote it first
    });
  }
  process.env.CONNECTIONS_ENCRYPTION_KEY = secrets!.CONNECTIONS_ENCRYPTION_KEY;
}

async function hasPracticeData(url: string): Promise<boolean> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [{ exists }] = await sql`select to_regclass('practice_os.schema_migrations') is not null as exists`;
    return exists;
  } finally {
    await sql.end();
  }
}

/**
 * Brings the built-in database up to date. If it already holds a practice and
 * a migration is pending, it backs up first (into <dir>/backups, newest 14 kept).
 * Returns the backup folder, or null when none was needed.
 */
export async function migrateWithBackup(url: string, dir: string = dataDir(), log?: (line: string) => void): Promise<string | null> {
  const pending = await pendingMigrations(url);
  if (pending.length === 0) return null;
  let backup: string | null = null;
  if (await hasPracticeData(url)) {
    const root = path.join(dir, "backups");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backup = path.join(root, `${stamp}-before-${pending[0].replace(/\.sql$/, "")}`);
    await backupDatabase(url, backup, "before migrations");
    await pruneBackups(root, BACKUPS_KEPT);
  }
  await runMigrations(url, { log });
  return backup;
}

type Prepared = { url: string; local: boolean };
let prepared: Promise<Prepared> | null = null;

/**
 * Makes DATABASE_URL usable for this process. With DATABASE_URL set (Supabase,
 * the Vercel copy) it changes nothing and never migrates: migrations there
 * stay a manual step. Without it, it starts the built-in database, sets
 * DATABASE_URL and the encryption key, and brings the schema up to date,
 * backing up first whenever a migration is about to run on existing data.
 */
export function prepareDatabase({ migrate = true, dir = dataDir() }: { migrate?: boolean; dir?: string } = {}): Promise<Prepared> {
  prepared ??= (async () => {
    if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, local: false };
    const url = await startLocalDatabase(dir);
    await ensureLocalSecrets(dir);
    if (migrate) await migrateWithBackup(url, dir);
    process.env.DATABASE_URL = url;
    return { url, local: true };
  })();
  prepared.catch(() => {
    prepared = null; // let the next caller try again
  });
  return prepared;
}
