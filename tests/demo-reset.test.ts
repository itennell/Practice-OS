// npm run db:reset (lib/demo-reset.ts) before a demo: testers' uploads go, with their files,
// and the crisis item at the top of Admin can be cleared ("I checked") or is cleared by a reset.
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { needsNext } from "../lib/admin/needs-next";
import { removeDocumentFiles } from "../lib/uploads/cleanup";
import { sha256 } from "../lib/uploads/store";
import { DANA_PROFILE } from "../lib/credentialing/demo";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { closeDb, db } = await import("../lib/db");
const { audit } = await import("../lib/audit");
const { loadAlertFailures } = await import("../lib/admin/load");
const { resetDemoData, DEMO_TABLES } = await import("../lib/demo-reset");
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
  if (hasDb) await closeDb();
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

  it("is fine when neither folder exists", async () => {
    const dir = await tempDir();
    expect(await removeDocumentFiles([{ stored_as: "documents/11111111-2222-4333-8444-555555555555.pdf", sha256: "a".repeat(64) }], dir)).toEqual({ documents: 0, inbox: 0 });
  });
});

describe("the crisis item's I checked button", () => {
  const base = { today: "2026-11-02", brief: null, estimates: [], superbills: [], profile: DANA_PROFILE };
  it("offers I checked next to its usual button", () => {
    const [item] = needsNext({ ...base, alertFailures: [{ id: "1", at: "2026-11-02T12:00:00Z" }] });
    expect(item.kind).toBe("urgent_alert");
    expect(item.also).toEqual({ label: "I checked", post: "/api/admin/crisis-seen" });
    expect(item.action).toHaveProperty("href");
  });
});

const req = (headers: Record<string, string>, host = "127.0.0.1:3000") =>
  new Request(`http://${host}/api/admin/crisis-seen`, { method: "POST", headers: { host, ...headers } });

describe.skipIf(!hasDb)("db:reset and the crisis item (database)", () => {
  afterEach(() => {
    delete process.env.VERCEL;
    delete process.env.ADMIN_PASSWORD;
  });

  const seenCount = async () => (await db()`select count(*)::int as n from practice_os.audit_log where action = 'crisis_alert_seen'`)[0].n as number;
  const fail = async () => {
    await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: "chat", details: { error: "vitest" } });
    const [row] = await db()`select max(id)::text as id from practice_os.audit_log where action = 'crisis_alert_failed'`;
    return row.id as string;
  };

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

    const result = await resetDemoData(db(), { dir });
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

  it("hides the alert after I checked, shows a new failure again, and hides it after a reset", async () => {
    const first = await fail();
    expect((await loadAlertFailures()).map((f) => f.id)).toContain(first);

    const res = await POST(req({ "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(200);
    const [seen] = await db()`select actor, action from practice_os.audit_log where action = 'crisis_alert_seen' order by id desc limit 1`;
    expect(seen).toEqual({ actor: "clinician", action: "crisis_alert_seen" });
    expect(await loadAlertFailures()).toEqual([]);

    const second = await fail();
    expect((await loadAlertFailures()).map((f) => f.id)).toEqual([second]);

    await resetDemoData(db(), { dir: await tempDir() });
    expect(await loadAlertFailures()).toEqual([]);
  });

  it("refuses I checked from another site, another host, or the view-only Vercel copy", async () => {
    const before = await seenCount();
    expect((await POST(req({ "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(req({}))).status).toBe(403); // no Sec-Fetch-Site or Origin
    expect((await POST(req({ "sec-fetch-site": "same-origin" }, "evil.example")))).toHaveProperty("status", 403);
    process.env.VERCEL = "1";
    expect((await POST(req({ "sec-fetch-site": "same-origin" }))).status).toBe(403);
    process.env.ADMIN_PASSWORD = "vitest-admin";
    expect((await POST(req({ "sec-fetch-site": "same-origin", "x-admin-password": "vitest-admin" }))).status).toBe(403);
    expect(await seenCount()).toBe(before);
  });
});
