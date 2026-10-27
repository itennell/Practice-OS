// Calendar sync against the live database. Runs only when DATABASE_URL is set.
// It rebuilds Dana's demo calendar (the same thing `npm run db:reset` does) and
// puts back any answer it changes.
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { CATEGORIES } from "../lib/compliance/types";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { db, closeDb } = await import("../lib/db");
const { loadFacts, syncCalendar } = await import("../lib/compliance/store");

afterAll(async () => {
  if (hasDb) await closeDb();
});

describe.skipIf(!hasDb)("compliance calendar in the database", () => {
  it("loads the practice facts from compliance_facts and the profile", async () => {
    const facts = await loadFacts();
    expect(facts).toMatchObject({ practice_state: "IL", city: "CHI", credential: "LCPC", has_pllc: true });
  });

  it("rebuilding is idempotent: same rows, no duplicates", async () => {
    const first = await syncCalendar();
    const second = await syncCalendar();
    expect(second.written).toBe(first.written);
    expect(second.removed).toBe(0);
    const [{ dupes }] = await db()`
      select count(*)::int as dupes from (
        select rule_id, due_on, started_on from practice_os.obligations
        where rule_id is not null group by 1, 2, 3 having count(*) > 1) d`;
    expect(dupes).toBe(0);
  });

  it("keeps her answer on a setup reminder across a rebuild", async () => {
    const [row] = await db()`select id from practice_os.obligations where rule_id = 'us_professional_will'`;
    try {
      await db()`update practice_os.obligations set status = 'done', answered_on = current_date,
        next_ask_on = current_date + 365 where id = ${row.id}`;
      await syncCalendar();
      const [after] = await db()`select status, answered_on from practice_os.obligations where id = ${row.id}`;
      expect(after.status).toBe("done");
      expect(after.answered_on).not.toBeNull();
    } finally {
      await db()`update practice_os.obligations set status = 'upcoming', answered_on = null,
        next_ask_on = current_date where id = ${row.id}`;
    }
  });

  it("every obligation row has its rule's source", async () => {
    const rows = await db()`select rule_id, citation, last_verified_on, verified_by from practice_os.obligations where rule_id is not null`;
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) expect(r, r.rule_id).toMatchObject({ verified_by: "maintainer" });
    for (const r of rows) expect(r.citation && r.last_verified_on, r.rule_id).toBeTruthy();
  });

  it("the obligations category check matches lib/compliance/types.ts", async () => {
    const [row] = await db()`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conname = 'obligations_category_check' and conrelid = 'practice_os.obligations'::regclass`;
    const inDb = [...String(row.def).matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    expect(inDb).toEqual([...CATEGORIES].sort());
  });
});
