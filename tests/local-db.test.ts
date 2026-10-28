// The built-in database (lib/local-db.ts) and its backups, each test in its own
// throwaway data folder. Needs the Postgres build for this computer, which
// `npm install` brings in through embedded-postgres.
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { backupDatabase, restoreDatabase } from "../lib/local-backup";
import { ensureLocalSecrets, migrateWithBackup, startLocalDatabase, stopLocalDatabase } from "../lib/local-db";
import { migrationFiles, runMigrations } from "../lib/migrations";

vi.setConfig({ testTimeout: 120_000 });

const dirs: string[] = [];
async function freshDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "practice-os-localdb-"));
  dirs.push(dir);
  return dir;
}

afterAll(async () => {
  for (const dir of dirs) {
    await stopLocalDatabase(dir).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

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
  });

  it("restores a backup into a new database (a new computer) with every row", async () => {
    const source = await startLocalDatabase(await freshDir());
    await runMigrations(source);
    await query(source, async (sql) => {
      for (let i = 0; i < 50; i++) await sql`insert into practice_os.audit_log (actor, action, details) values ('system', 'drill', ${sql.json({ i })})`;
    });
    const backupDir = path.join(await freshDir(), "backup");
    const made = await backupDatabase(source, backupDir, "drill");

    const target = await startLocalDatabase(await freshDir());
    await runMigrations(target);
    const restored = await restoreDatabase(target, backupDir);
    expect(restored.rows).toEqual(made.rows);
    expect(await auditCount(target)).toBe(50);

    // New rows continue after the restored ids.
    const [{ id }] = await query(target, (sql) => sql`insert into practice_os.audit_log (actor, action) values ('system', 'after') returning id`);
    const [{ max }] = await query(target, (sql) => sql`select max(id)::int as max from practice_os.audit_log where action = 'drill'`);
    expect(Number(id)).toBeGreaterThan(max);

    // A second restore on top of real data is refused.
    await expect(restoreDatabase(target, backupDir)).rejects.toThrow(/empty/);
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
