// npm run db:reset (lib/demo-reset.ts) before a demo: testers' uploads go, with their files,
// and the crisis item at the top of Admin can be cleared ("I checked") or is cleared by a reset.
//
// The database part empties the demo tables and writes permanent audit rows, so it runs ONLY
// against the built-in throwaway database on this computer (like tests/onboarding-db.test.ts),
// never a shared one named in .env; resetDemoData also refuses any project but "local" here.
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { needsNext } from "../lib/admin/needs-next";
import { DANA_PROFILE } from "../lib/credentialing/demo";
import { projectRefOf, resetDemoData, resetRefusal, DEMO_NICHE, DEMO_REFERRAL_KINDS, DEMO_TABLES } from "../lib/demo-reset";
import { removeDocumentFiles } from "../lib/uploads/cleanup";
import { sha256 } from "../lib/uploads/store";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const { audit } = await import("../lib/audit");
const { loadAlertFailures } = await import("../lib/admin/load");
const { POST } = await import("../app/api/admin/crisis-seen/route");

const dirs: string[] = [];
const tempDir = async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), "practice-os-reset-"));
  dirs.push(d);
  return d;
};
const exists = (p: string) => stat(p).then(() => true, () => false);

afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
  if (local) await closeDb();
});

const SUPABASE = "postgresql://postgres.abcdefghij:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const BUILT_IN = "postgres://postgres:pw@127.0.0.1:54329/postgres";

describe("which database a reset may run on", () => {
  it("allows only the project named in SUPABASE_PROJECT_REF; the built-in database is local", () => {
    expect(projectRefOf(BUILT_IN)).toBe("local");
    expect(projectRefOf(SUPABASE)).toBe("abcdefghij");
    expect(resetRefusal(BUILT_IN, "local")).toBeNull();
    expect(resetRefusal(SUPABASE, "abcdefghij")).toBeNull();
    expect(resetRefusal(SUPABASE, "local")).toMatch(/Refusing to reset/);
    expect(resetRefusal(BUILT_IN, "abcdefghij")).toMatch(/Refusing to reset/);
    expect(resetRefusal(BUILT_IN, undefined)).toMatch(/SUPABASE_PROJECT_REF is not set/);
    expect(resetRefusal("not a url", "local")).toMatch(/Refusing to reset/);
  });

  it("calls a database local only on 127.0.0.1 or localhost", () => {
    expect(projectRefOf("postgres://postgres.local:pw@127.0.0.1:54329/postgres")).toBe("local");
    expect(projectRefOf("postgres://postgres:pw@localhost:5432/postgres")).toBe("local");
    expect(projectRefOf("postgres://postgres:pw@[::1]:5432/postgres")).toBe("local");
    // A "local" user on another host, or a project user tunnelled to localhost, is neither.
    expect(projectRefOf("postgres://postgres.local:pw@db.example.com:5432/postgres")).toBeNull();
    expect(projectRefOf("postgres://postgres:pw@10.0.0.5:5432/postgres")).toBeNull();
    expect(projectRefOf("postgres://postgres.abcdefghij:pw@127.0.0.1:6543/postgres")).toBeNull();
    expect(resetRefusal("postgres://postgres.local:pw@db.example.com:5432/postgres", "local")).toMatch(/Refusing to reset/);
  });

  it("takes a Supabase project ref only from a *.supabase.co or *.pooler.supabase.com host", () => {
    expect(projectRefOf(SUPABASE)).toBe("abcdefghij");
    expect(projectRefOf("postgresql://postgres:pw@db.abcdefghij.supabase.co:5432/postgres")).toBe("abcdefghij");
    expect(projectRefOf("postgresql://postgres.abcdefghij:pw@pooler.example.com:6543/postgres")).toBeNull();
    expect(projectRefOf("postgresql://postgres.abcdefghij:pw@evilsupabase.co:6543/postgres")).toBeNull();
    expect(projectRefOf("postgresql://postgres.abcdefghij:pw@supabase.co.example.com:6543/postgres")).toBeNull();
    expect(projectRefOf("postgresql://postgres.local:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres")).toBeNull();
    expect(resetRefusal("postgresql://postgres.abcdefghij:pw@pooler.example.com:6543/postgres", "abcdefghij")).toMatch(/Refusing to reset/);
  });

  it("resetDemoData refuses before opening any connection", async () => {
    await expect(resetDemoData({ url: SUPABASE, expectedRef: "local" })).rejects.toThrow(/Refusing to reset/);
    await expect(resetDemoData({ url: BUILT_IN, expectedRef: "abcdefghij" })).rejects.toThrow(/Refusing to reset/);
    const saved = process.env.SUPABASE_PROJECT_REF;
    delete process.env.SUPABASE_PROJECT_REF;
    try {
      await expect(resetDemoData({ url: BUILT_IN })).rejects.toThrow(/not set/);
    } finally {
      if (saved !== undefined) process.env.SUPABASE_PROJECT_REF = saved;
    }
  });
});

describe("removing the files of reset documents", () => {
  it("deletes only the rows' files in documents/ and matching files in inbox/, and tolerates missing ones", async () => {
    const dir = await tempDir();
    await mkdir(path.join(dir, "documents"));
    await mkdir(path.join(dir, "inbox"));
    const lease = Buffer.from("[Sample] fake lease");
    const id = "11111111-2222-4333-8444-555555555555";
    await writeFile(path.join(dir, "documents", `${id}.pdf`), lease);
    await writeFile(path.join(dir, "documents", "66666666-2222-4333-8444-555555555555.txt"), "someone else's"); // no row: kept
    await writeFile(path.join(dir, "inbox", "lease.pdf"), lease); // same bytes as the row: removed
    await writeFile(path.join(dir, "inbox", "other.txt"), "not a removed document"); // kept
    await writeFile(path.join(dir, "secret.txt"), "outside both folders");
    await symlink(path.join(dir, "secret.txt"), path.join(dir, "inbox", "link.txt")); // a link: never followed or removed

    const result = await removeDocumentFiles(
      [
        { stored_as: `documents/${id}.pdf`, sha256: sha256(lease) },
        { stored_as: "documents/77777777-2222-4333-8444-555555555555.docx", sha256: "0".repeat(64) }, // file already gone
        { stored_as: "../secret.txt", sha256: sha256(Buffer.from("outside both folders")) }, // not a stored_as shape
      ],
      dir,
    );
    expect(result).toEqual({ documents: 1, inbox: 1 });
    expect(await exists(path.join(dir, "documents", `${id}.pdf`))).toBe(false);
    expect(await exists(path.join(dir, "inbox", "lease.pdf"))).toBe(false);
    expect(await exists(path.join(dir, "documents", "66666666-2222-4333-8444-555555555555.txt"))).toBe(true);
    expect(await exists(path.join(dir, "inbox", "other.txt"))).toBe(true);
    expect(await readFile(path.join(dir, "secret.txt"), "utf8")).toBe("outside both folders");
    expect(await exists(path.join(dir, "inbox", "link.txt"))).toBe(true);
  });

  it("skips documents/ and inbox/ when they are links to another folder", async () => {
    const dir = await tempDir();
    const elsewhere = await tempDir();
    const bytes = Buffer.from("[Sample] somewhere else");
    const id = "88888888-2222-4333-8444-555555555555";
    await writeFile(path.join(elsewhere, `${id}.txt`), bytes);
    await writeFile(path.join(elsewhere, "copy.txt"), bytes);
    await symlink(elsewhere, path.join(dir, "documents"));
    await symlink(elsewhere, path.join(dir, "inbox"));
    expect(await removeDocumentFiles([{ stored_as: `documents/${id}.txt`, sha256: sha256(bytes) }], dir)).toEqual({ documents: 0, inbox: 0 });
    expect(await exists(path.join(elsewhere, `${id}.txt`))).toBe(true);
    expect(await exists(path.join(elsewhere, "copy.txt"))).toBe(true);
  });

  it("is fine when neither folder exists", async () => {
    const dir = await tempDir();
    expect(await removeDocumentFiles([{ stored_as: "documents/11111111-2222-4333-8444-555555555555.pdf", sha256: "a".repeat(64) }], dir)).toEqual({ documents: 0, inbox: 0 });
  });
});

describe("the crisis item's I checked button", () => {
  const base = { today: "2026-11-02", brief: null, estimates: [], superbills: [], profile: DANA_PROFILE };
  it("offers I checked for the item she sees, next to its usual button", () => {
    const [item] = needsNext({ ...base, alertFailures: [{ id: "42", at: "2026-11-02T12:00:00Z" }] });
    expect(item.kind).toBe("urgent_alert");
    expect(item.also).toEqual({ label: "I checked", post: "/api/admin/crisis-seen", body: { item: "urgent_alert:42" } });
    expect(item.action).toHaveProperty("href");
  });
});

const req = (body: unknown, headers: Record<string, string>, host = "127.0.0.1:3000") =>
  new Request(`http://${host}/api/admin/crisis-seen`, {
    method: "POST",
    headers: { host, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const SAME = { "sec-fetch-site": "same-origin" };

describe.skipIf(!local)("db:reset and the crisis item (built-in database only)", () => {
  afterEach(() => {
    delete process.env.VERCEL;
    delete process.env.ADMIN_PASSWORD;
  });

  const reset = async (dir?: string) => resetDemoData({ url: process.env.DATABASE_URL!, expectedRef: "local", dir: dir ?? (await tempDir()) });
  const seenCount = async () => (await db()`select count(*)::int as n from practice_os.audit_log where action = 'crisis_alert_seen'`)[0].n as number;
  const fail = async () => {
    await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: "chat", details: { error: "vitest" } });
    const [row] = await db()`select max(id)::text as id from practice_os.audit_log where action = 'crisis_alert_failed'`;
    return row.id as string;
  };
  const shown = async () => (await loadAlertFailures()).map((f) => f.id);

  it("resets documents and removes their files, and leaves settings, connections and model_calls alone", async () => {
    expect(DEMO_TABLES).toContain("documents");
    const dir = await tempDir();
    await mkdir(path.join(dir, "documents"));
    const bytes = Buffer.from(`[Sample] intake notes ${Date.now()}`);
    const id = randomUUID();
    const stored_as = `documents/${id}.txt`;
    await db()`
      insert into practice_os.documents (id, kind, title, mime, size_bytes, sha256, stored_as, created_by)
      values (${id}, 'other_business', '[Sample] Fake lease', 'text/plain', ${bytes.length}, ${sha256(bytes)}, ${stored_as}, 'vitest')`;
    await writeFile(path.join(dir, stored_as), bytes);

    const count = async (t: string) => (await db().unsafe(`select count(*)::int as n from practice_os.${t}`))[0].n as number;
    const before = { settings: await count("settings"), connections: await count("connections"), model_calls: await count("model_calls"), audit: await count("audit_log") };

    const result = await reset(dir);
    expect(result.removedFiles.documents).toBeGreaterThanOrEqual(1);
    expect(await count("documents")).toBe(0);
    expect(await exists(path.join(dir, stored_as))).toBe(false);
    expect({ settings: await count("settings"), connections: await count("connections"), model_calls: await count("model_calls") }).toEqual({
      settings: before.settings,
      connections: before.connections,
      model_calls: before.model_calls,
    });
    expect(await count("audit_log")).toBeGreaterThan(before.audit); // append-only: nothing removed
    const [last] = await db()`select actor, action from practice_os.audit_log order by id desc limit 1`;
    expect(last).toEqual({ actor: "db:reset", action: "demo_reset" });
  });

  it("gives Dana the oncology niche and its kinds every time, and seeds no score as current", async () => {
    await db()`update practice_os.referral_settings set niche_preset = 'grief_loss', specialties = ${["pediatrics"]} where id`;
    await reset(await tempDir());
    const [row] = await db()<{ niche_preset: string; specialties: string[] }[]>`select niche_preset, specialties from practice_os.referral_settings where id`;
    expect(row.niche_preset).toBe(DEMO_NICHE);
    expect(row.specialties).toEqual(DEMO_REFERRAL_KINDS);
    expect(row.specialties).toContain("oncology");
    const scored = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.referral_sources where is_sample and score_version <> 0`;
    expect(scored[0].n).toBe(0);
  });

  it("I checked hides the item she saw and older ones, not one logged after her page loaded", async () => {
    const a = await fail();
    const b = await fail(); // logged after her page showed a
    expect(await shown()).toEqual([b, a]);

    expect((await POST(req({ item: `urgent_alert:${a}` }, SAME))).status).toBe(200);
    const [seen] = await db()`select actor, action, details from practice_os.audit_log where action = 'crisis_alert_seen' order by id desc limit 1`;
    expect(seen).toEqual({ actor: "clinician", action: "crisis_alert_seen", details: { through_id: a } });
    expect(await shown()).toEqual([b]);

    expect((await POST(req({ item: `urgent_alert:${b}` }, SAME))).status).toBe(200);
    expect(await shown()).toEqual([]);

    const c = await fail(); // a new failure shows again
    expect(await shown()).toEqual([c]);
  });

  it("a reset hides only failures before it, and says how many it cleared", async () => {
    const before = await fail();
    const result = await reset();
    expect(result.clearedCrisisAlerts).toBeGreaterThanOrEqual(1);
    expect(await shown()).toEqual([]);
    const [row] = await db()`select details from practice_os.audit_log where action = 'demo_reset' order by id desc limit 1`;
    expect(row.details.cleared_crisis_alerts).toBe(result.clearedCrisisAlerts);
    const after = await fail();
    expect(await shown()).toEqual([after]);
    expect(after).not.toBe(before);
    await POST(req({ item: `urgent_alert:${after}` }, SAME)); // leave Admin clear for later files
  });

  it("refuses an unknown or malformed item", async () => {
    const before = await seenCount();
    const [{ id: other }] = await db()`select max(id)::text as id from practice_os.audit_log where action <> 'crisis_alert_failed'`;
    expect((await POST(req({ item: `urgent_alert:${other}` }, SAME))).status).toBe(404);
    expect((await POST(req({ item: "urgent_alert:1 or 1=1" }, SAME))).status).toBe(400);
    expect((await POST(req({}, SAME))).status).toBe(400);
    expect(await seenCount()).toBe(before);
  });

  it("refuses I checked from another site, another host, or the view-only Vercel copy", async () => {
    const id = await fail();
    const body = { item: `urgent_alert:${id}` };
    const before = await seenCount();
    expect((await POST(req(body, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(req(body, {}))).status).toBe(403); // no Sec-Fetch-Site or Origin
    expect((await POST(req(body, SAME, "evil.example"))).status).toBe(403);
    process.env.VERCEL = "1";
    expect((await POST(req(body, SAME))).status).toBe(403);
    process.env.ADMIN_PASSWORD = "vitest-admin";
    expect((await POST(req(body, { ...SAME, "x-admin-password": "vitest-admin" }))).status).toBe(403);
    expect(await seenCount()).toBe(before);
    delete process.env.VERCEL;
    await POST(req(body, SAME));
  });
});
