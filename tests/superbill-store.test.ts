// Saved superbills against the live database. Runs only when DATABASE_URL is
// set and migration 010 has run; every superbill made here is deleted after.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { closeDb, db } = await import("../lib/db");
const store = await import("../lib/superbill/store");
const { runTool } = await import("../lib/aeon/tools");

const CANARY = "Zebulon Quixtar-Canary";
const made: string[] = [];
let ready = false;

beforeAll(async () => {
  if (!hasDb) return;
  const [r] = await db()`select to_regclass('practice_os.superbills') is not null as ok`;
  ready = Boolean(r?.ok);
  if (!ready) console.warn("[superbill-store] migration 010 hasn't run yet; skipping database checks.");
});

afterAll(async () => {
  if (!hasDb) return;
  if (made.length) await db()`delete from practice_os.superbills where id in ${db()(made)}`;
  await closeDb();
});

const line = { date_of_service: "2026-10-05", cpt: "90837", modifier: "95", pos: "10", cents: 17_500 };

describe.skipIf(!hasDb)("saved superbills", () => {
  it("the table has no column that could hold who the client is", async ({ skip }) => {
    if (!ready) skip();
    const cols = await db()<{ column_name: string }[]>`
      select column_name from information_schema.columns
       where table_schema = 'practice_os' and table_name = 'superbills'`;
    expect(cols.map((c) => c.column_name).sort()).toEqual(
      ["created_at", "created_by", "id", "is_sample", "issued_on", "lines", "paid_cents", "reference", "total_cents", "updated_at"].sort(),
    );
  });

  it("saves by reference, then marks it given once", async ({ skip }) => {
    if (!ready) skip();
    const sb = await store.createSuperbill({ lines: [line, { ...line, date_of_service: "2026-10-12" }], paid_cents: 17_500 }, { createdBy: "test" });
    made.push(sb.id);
    expect(sb.reference).toMatch(/^SB-\d{4}-\d{4}$/);
    expect(sb).toMatchObject({ total_cents: 35_000, paid_cents: 17_500, issued_on: null });
    const given = await store.markGiven(sb.id, "test");
    expect(given?.issued_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const again = await store.markGiven(sb.id, "test");
    expect(again?.issued_on).toBe(given?.issued_on);
  });

  it("the database refuses a line with an extra key, even past the app", async ({ skip }) => {
    if (!ready) skip();
    await expect(
      db()`insert into practice_os.superbills (lines, total_cents, created_by)
           values (${db().json([{ ...line, client_name: CANARY }] as never)}, 17500, 'test')`,
    ).rejects.toThrow();
  });

  it("canary: a client name offered to the tool and the store is stored nowhere", async ({ skip }) => {
    if (!ready) skip();
    const viaTool = await runTool("draft_superbill", { lines: [{ ...line, client_name: CANARY }] }, { by: "test" });
    expect(viaTool.isError).toBe(true);
    await expect(store.createSuperbill({ lines: [line], client: CANARY }, { createdBy: "test" })).rejects.toThrow();
    const ok = await runTool("draft_superbill", { lines: [line], note: CANARY }, { by: "test" });
    const ref = JSON.parse(ok.content[0].text).reference as string;
    const [row] = await db()<{ id: string }[]>`select id from practice_os.superbills where reference = ${ref}`;
    made.push(row.id);
    const tables = await db()<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'practice_os' and table_type = 'BASE TABLE'`;
    for (const { table_name } of tables) {
      const [hit] = await db().unsafe(`select count(*)::int as n from practice_os.${table_name} t where t::text ilike $1`, [`%${CANARY}%`]);
      expect(hit.n, `${table_name} holds the canary`).toBe(0);
    }
  });
});
