// Live database checks. They run only when DATABASE_URL is set (your Mac),
// so CI stays green without a key. They leave no rows behind.
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 4, prepare: false, onnotice: () => {} }) : null;

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

describe.skipIf(!sql)("practice_os database", () => {
  it("locks every table: RLS on, no policies, no access for Supabase's public roles", async () => {
    const rows = await sql!`
      select c.relname, c.relrowsecurity as rls,
        (select count(*)::int from pg_policies p where p.schemaname = 'practice_os' and p.tablename = c.relname) as policies,
        has_table_privilege('anon', c.oid, 'select') as anon,
        has_table_privilege('authenticated', c.oid, 'select') as authenticated
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'practice_os' and c.relkind = 'r'`;
    expect(rows.length).toBeGreaterThanOrEqual(15);
    for (const row of rows) {
      expect(row, row.relname).toMatchObject({ rls: true, policies: 0, anon: false, authenticated: false });
    }
  });

  it("refuses edits and deletes on audit_log", async () => {
    await expect(sql!`update practice_os.audit_log set actor = 'x'`).rejects.toThrow(/append-only/);
    await expect(sql!`delete from practice_os.audit_log`).rejects.toThrow(/append-only/);
  });

  it("lets exactly one of two simultaneous approve clicks claim a pending approval", async () => {
    const [row] = await sql!`
      insert into practice_os.approvals (kind, title, created_by)
      values ('sms_reply', 'race test', 'test') returning id`;
    try {
      const claim = () => sql!`
        update practice_os.approvals set status = 'running', decided_at = now(), decided_by = 'test'
        where id = ${row.id} and status = 'pending' returning id`;
      const results = await Promise.all([claim(), claim()]);
      expect(results.filter((r) => r.length === 1)).toHaveLength(1);
    } finally {
      await sql!`delete from practice_os.approvals where id = ${row.id}`;
    }
  });

  it("refuses a plain (unencrypted) token in connections", async () => {
    await expect(
      sql!`insert into practice_os.connections (provider, access_token_enc) values ('twilio', 'plain-token')`,
    ).rejects.toThrow(/connections_tokens_encrypted/);
  });

  it("rejects an unknown approval kind", async () => {
    await expect(
      sql!`insert into practice_os.approvals (kind, title, created_by) values ('wire_money', 'x', 'test')`,
    ).rejects.toThrow(/check constraint/);
  });

  it("seeds the fictional Dana Reyes practice with 3 pending [Sample] helper approvals", async () => {
    const [profile] = await sql!`select full_name, credential, license_line, practice_stage from practice_os.clinician_profile`;
    expect(profile).toMatchObject({
      full_name: "Dana Reyes",
      credential: "LCPC",
      license_line: "Dana Reyes, LCPC (fictional demo practice)",
      practice_stage: "beginning",
    });
    const pending = await sql!`select title from practice_os.approvals where status = 'pending' and is_sample and kind <> 'test_note'`;
    expect(pending).toHaveLength(3);
    for (const p of pending) expect(p.title).toMatch(/^\[Sample\]/);
  });
});
