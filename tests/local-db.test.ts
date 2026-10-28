// The built-in database (lib/local-db.ts) and its backups, each test in its own
// throwaway data folder. Needs the Postgres build for this computer, which
// `npm install` brings in through embedded-postgres.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { backupDatabase, restoreDatabase } from "../lib/local-backup";
import { backupKey, ensureLocalSecrets, migrateWithBackup, startLocalDatabase, stopLocalDatabase } from "../lib/local-db";
import { migrationFiles, runMigrations } from "../lib/migrations";

vi.setConfig({ testTimeout: 120_000 });

const dirs: string[] = [];
async function freshDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "practice-os-localdb-"));
  dirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(
    dirs.map(async (dir) => {
      await stopLocalDatabase(dir).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }),
  );
}, 120_000);

async function query<T>(url: string, run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

const auditCount = (url: string) =>
  query(url, async (sql) => (await sql`select count(*)::int as n from practice_os.audit_log`)[0].n as number);

describe("built-in database", () => {
  it("starts on 127.0.0.1 with a password kept in an owner-only file, and joins a running one", async () => {
    const dir = await freshDir();
    const url = await startLocalDatabase(dir);
    expect(new URL(url).hostname).toBe("127.0.0.1");
    expect((await stat(path.join(dir, "local-db.json"))).mode & 0o077).toBe(0);
    expect(await startLocalDatabase(dir)).toBe(url);
    const listen = await query(url, async (sql) => (await sql`show listen_addresses`)[0].listen_addresses);
    expect(listen).toBe("127.0.0.1");
  });

  it("waits on a live starter's lock however old it is, and breaks a dead one's", async () => {
    const dir = await freshDir();
    const lock = path.join(dir, "start.lock");
    const old = new Date(Date.now() - 120_000);

    // A live owner (this process) that has held the lock for 2 minutes: keep waiting.
    await writeFile(lock, String(process.pid));
    await utimes(lock, old, old);
    let settled = false;
    const starting = startLocalDatabase(dir).finally(() => (settled = true));
    await new Promise((r) => setTimeout(r, 2_000));
    expect(settled).toBe(false);
    await rm(lock);
    const url = await starting;

    // An owner that has exited: the lock is stale at once.
    const dead = spawnSync(process.execPath, ["-e", ""]).pid;
    await writeFile(lock, String(dead));
    expect(await startLocalDatabase(dir)).toBe(url);
  });

  it("recovers from a first start that crashed part way through initdb", async () => {
    const dir = await freshDir();
    // What a crash leaves behind: half-built folders, and no password file.
    await mkdir(path.join(dir, "postgres.init"), { recursive: true });
    await writeFile(path.join(dir, "postgres.init", "postgresql.conf"), "");
    await mkdir(path.join(dir, "postgres"), { recursive: true });
    await writeFile(path.join(dir, "postgres", "global"), "");
    const url = await startLocalDatabase(dir);
    expect(await query(url, async (sql) => (await sql`select 1 as ok`)[0].ok)).toBe(1);
    expect(existsSync(path.join(dir, "postgres.init"))).toBe(false);
    expect((await stat(path.join(dir, "local-db.json"))).mode & 0o077).toBe(0);
  });

  it("db:stop returns quietly when postmaster.pid was left by a crash", async () => {
    const dir = await freshDir();
    await startLocalDatabase(dir);
    const pidFile = path.join(dir, "postgres", "postmaster.pid");
    const contents = await readFile(pidFile, "utf8");
    await stopLocalDatabase(dir);
    const dead = spawnSync(process.execPath, ["-e", ""]).pid;
    await writeFile(pidFile, contents.replace(/^\d+/, String(dead)));
    await expect(stopLocalDatabase(dir)).resolves.toBeUndefined();
  });

  it("runs every migration on plain Postgres", async () => {
    const url = await startLocalDatabase(await freshDir());
    await runMigrations(url);
    const applied = await query(url, async (sql) => (await sql`select name from practice_os.schema_migrations order by name`).map((r) => r.name));
    expect(applied).toEqual(await migrationFiles());
  });

  it("applies each migration once when two runners start together", async () => {
    const url = await startLocalDatabase(await freshDir());
    const [a, b] = await Promise.all([runMigrations(url), runMigrations(url)]);
    const files = await migrationFiles();
    expect([...a, ...b].sort()).toEqual(files);
    const applied = await query(url, async (sql) => (await sql`select name from practice_os.schema_migrations order by name`).map((r) => r.name));
    expect(applied).toEqual(files);
  });

  it("generates the encryption key once and keeps it", async () => {
    const dir = await freshDir();
    const saved = process.env.CONNECTIONS_ENCRYPTION_KEY;
    try {
      delete process.env.CONNECTIONS_ENCRYPTION_KEY;
      await ensureLocalSecrets(dir);
      const first = process.env.CONNECTIONS_ENCRYPTION_KEY!;
      expect(Buffer.from(first, "base64")).toHaveLength(32);
      expect((await stat(path.join(dir, "secrets.json"))).mode & 0o077).toBe(0);
      delete process.env.CONNECTIONS_ENCRYPTION_KEY;
      await ensureLocalSecrets(dir);
      expect(process.env.CONNECTIONS_ENCRYPTION_KEY).toBe(first);

      // A separate key for backups, kept the same way.
      const backup = await backupKey(dir);
      expect(backup).toHaveLength(32);
      expect(backup.equals(Buffer.from(first, "base64"))).toBe(false);
      expect((await backupKey(dir)).equals(backup)).toBe(true);
    } finally {
      if (saved) process.env.CONNECTIONS_ENCRYPTION_KEY = saved;
      else delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    }
  });

  it("upgrades a database from the previous release, backing up first and keeping its rows", async () => {
    const dir = await freshDir();
    const url = await startLocalDatabase(dir);
    const files = await migrationFiles();
    await runMigrations(url, { upTo: files[files.length - 2] });
    await query(url, (sql) => sql`insert into practice_os.audit_log (actor, action) values ('system', 'before-upgrade')`);

    const backup = await migrateWithBackup(url, dir);
    expect(backup && existsSync(path.join(backup, "manifest.json"))).toBe(true);
    const manifest = JSON.parse(await readFile(path.join(backup!, "manifest.json"), "utf8"));
    expect(manifest.migrations).toEqual(files.slice(0, -1));
    expect(await auditCount(url)).toBe(1);
    expect(await migrateWithBackup(url, dir)).toBeNull(); // nothing pending, no backup

    // The backup opens with this data folder's backup key.
    const target = await startLocalDatabase(await freshDir());
    await runMigrations(target, { upTo: files[files.length - 2] });
    await restoreDatabase(target, backup!, await backupKey(dir));
    expect(await auditCount(target)).toBe(1);
  });

  it("npm run db:migrate backs up the built-in database first", async () => {
    const dir = await freshDir();
    const url = await startLocalDatabase(dir);
    const files = await migrationFiles();
    await runMigrations(url, { upTo: files[files.length - 2] });
    await query(url, (sql) => sql`insert into practice_os.audit_log (actor, action) values ('system', 'before-upgrade')`);

    // DATABASE_URL set but empty, so a .env file can't fill it in and point the script at a shared database.
    execFileSync("npx", ["tsx", "scripts/migrate.ts"], { env: { ...process.env, DATABASE_URL: "", PRACTICE_OS_DATA_DIR: dir }, stdio: "ignore" });
    expect(await readdir(path.join(dir, "backups"))).toHaveLength(1);
    expect(await auditCount(url)).toBe(1);
  });

  it("restores a backup into a new database (a new computer) with every row", async () => {
    const source = await startLocalDatabase(await freshDir());
    await runMigrations(source);
    await query(source, async (sql) => {
      for (let i = 0; i < 50; i++) {
        await sql`insert into practice_os.audit_log (actor, action, details) values ('system', 'drill', ${sql.json({ note: "drill-row", i })})`;
      }
    });
    const backupDir = path.join(await freshDir(), "backup");
    const key = randomBytes(32);
    const made = await backupDatabase(source, backupDir, "drill", key);

    // Every table file is encrypted; the manifest holds counts, not rows.
    for (const name of await readdir(backupDir)) {
      const text = (await readFile(path.join(backupDir, name))).toString("latin1");
      expect(text, name).not.toContain("drill-row");
      if (name !== "manifest.json") expect(name).toMatch(/\.copy\.enc$/);
    }

    const target = await startLocalDatabase(await freshDir());
    await runMigrations(target);
    // The wrong key, or a damaged file, is refused and leaves the database empty.
    await expect(restoreDatabase(target, backupDir, randomBytes(32))).rejects.toThrow(/can't be opened with this key/);
    expect(await auditCount(target)).toBe(0);
    const restored = await restoreDatabase(target, backupDir, key);
    expect(restored.rows).toEqual(made.rows);
    expect(await auditCount(target)).toBe(50);

    // New rows continue after the restored ids.
    const [{ id }] = await query(target, (sql) => sql`insert into practice_os.audit_log (actor, action) values ('system', 'after') returning id`);
    const [{ max }] = await query(target, (sql) => sql`select max(id)::int as max from practice_os.audit_log where action = 'drill'`);
    expect(Number(id)).toBeGreaterThan(max);

    // A second restore on top of real data is refused.
    await expect(restoreDatabase(target, backupDir, key)).rejects.toThrow(/empty/);
  });

  it.skipIf(process.platform === "win32")("waits for its own slow Postgres instead of moving the port", async () => {
    const dir = await freshDir();
    const url = await startLocalDatabase(dir);
    const pid = Number((await readFile(path.join(dir, "postgres", "postmaster.pid"), "utf8")).split("\n")[0]);
    process.kill(pid, "SIGSTOP"); // still running, but not answering
    const resume = setTimeout(() => process.kill(pid, "SIGCONT"), 3_000);
    try {
      expect(await startLocalDatabase(dir)).toBe(url);
    } finally {
      clearTimeout(resume);
      process.kill(pid, "SIGCONT");
    }
  });

  it.skipIf(process.platform === "win32")("loses no confirmed write when Postgres is killed", async () => {
    const dir = await freshDir();
    const url = await startLocalDatabase(dir);
    await runMigrations(url);
    await query(url, async (sql) => {
      for (let i = 0; i < 200; i++) await sql`insert into practice_os.audit_log (actor, action) values ('system', 'crash')`;
    });
    const pid = Number((await readFile(path.join(dir, "postgres", "postmaster.pid"), "utf8")).split("\n")[0]);
    process.kill(pid, "SIGKILL");
    await new Promise((r) => setTimeout(r, 500));
    expect(await startLocalDatabase(dir)).toBe(url);
    expect(await auditCount(url)).toBe(200);
  });
});
