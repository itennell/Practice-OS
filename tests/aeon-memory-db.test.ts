// Aeon's memory against the live database (runs only when DATABASE_URL is set
// and the name-finder is downloaded). Every memory made here is deleted after;
// their audit rows stay (append-only) and hold no text.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { NER_MODEL, modelCacheDir } from "../lib/aeon/phi-classifier";
import { gluedNames } from "./fixtures/phi-corpus";

loadEnv();
const ready = Boolean(process.env.DATABASE_URL) && existsSync(path.join(modelCacheDir(), NER_MODEL));

const mem = await import("../lib/aeon/memory");
const { closeDb, db } = await import("../lib/db");

const tag = `t${Date.now().toString(36)}`;
const made: string[] = [];
const by = { actor: "aeon" as const, source: "test:vitest" };

afterAll(async () => {
  if (!ready) return;
  // Everything this file saved, including anything the guard should have refused.
  await db()`delete from practice_os.memories where source = ${by.source} or id in ${db()(made.length ? made : ["00000000-0000-0000-0000-000000000000"])}`;
  await mem.renderMemoryFile();
  await closeDb();
});

describe.skipIf(!ready)("memories (live database)", () => {
  it("saves a practice fact, audits id and kind only, and writes MEMORY.md", async () => {
    const text = `[Sample] Prefers Tuesday consults (${tag})`;
    const { memory, created } = await mem.remember({ kind: "preference", text }, by);
    made.push(memory.id);
    expect(created).toBe(true);

    const [row] = await db()`select action, details from practice_os.audit_log where subject_id = ${memory.id}`;
    expect(row.action).toBe("memory_saved");
    expect(JSON.stringify(row.details)).not.toContain(tag);

    const file = await readFile(path.join(process.cwd(), "aeon", "MEMORY.md"), "utf8");
    expect(file).toContain(tag);
  });

  it("does not save the same text twice", async () => {
    const text = `[Sample] Does not take Medicaid (${tag})`;
    const first = await mem.remember({ kind: "decision", text }, by);
    made.push(first.memory.id);
    const second = await mem.remember({ kind: "decision", text: text.toUpperCase() }, by);
    expect(second).toEqual({ memory: first.memory, created: false });
  });

  // The marker that finds the row again sits in its own brackets: glued onto the
  // name it changed every run (Date.now) and once slipped past the guard in CI.
  // Glued characters are covered by the fixed list below instead.
  it.each([
    ["My client Zelda Quint prefers mornings {u}", "client_name"],
    ["Kevin Ortiz pays on the 1st {u}", "client_name"],
    ["DOB 3/14/1988 {u}", "birth_date"],
    ["she has PTSD {u}", "diagnosis"],
  ])("refuses %s and stores it nowhere", async (template, kind) => {
    const unique = `${tag}r${made.length}${kind}`;
    const text = template.replace("{u}", `(${unique})`);
    await expect(mem.remember({ kind: "fact", text }, by)).rejects.toMatchObject({ kind });
    const [{ n }] = await db()`
      select (select count(*) from practice_os.memories where text like ${"%" + unique + "%"})
           + (select count(*) from practice_os.audit_log where details::text like ${"%" + unique + "%"}) as n`;
    expect(Number(n)).toBe(0);
  });

  it("refuses a client name with any odd character glued on, and stores none of them", async () => {
    const unique = `${tag}glued`;
    const slipped: string[] = [];
    for (const name of gluedNames("Kevin Ortiz")) {
      const text = `${name} pays on the 1st (${unique})`;
      const saved = await mem.remember({ kind: "fact", text }, by).then(
        (r) => (made.push(r.memory.id), true),
        (err: unknown) => !(err instanceof mem.MemoryRefused),
      );
      if (saved) slipped.push(JSON.stringify(name));
    }
    expect(slipped).toEqual([]);
    const [{ n }] = await db()`select count(*) as n from practice_os.memories where text like ${"%" + unique + "%"}`;
    expect(Number(n)).toBe(0);
  });

  it("replaces an older memory and forgets on request", async () => {
    const old = await mem.remember({ kind: "fact", text: `[Sample] Fee for 90837 is $165 (${tag})` }, by);
    made.push(old.memory.id);
    const fresh = await mem.remember({ kind: "fact", text: `[Sample] Fee for 90837 is $175 (${tag})`, replaces: old.memory.id }, by);
    made.push(fresh.memory.id);
    expect((await mem.getMemory(old.memory.id))?.archived).toBe(true);
    expect(fresh.memory.supersedes_id).toBe(old.memory.id);

    const active = (await mem.listMemories()).map((m) => m.id);
    expect(active).toContain(fresh.memory.id);
    expect(active).not.toContain(old.memory.id);

    await mem.forget(fresh.memory.id, by);
    expect((await mem.listMemories()).map((m) => m.id)).not.toContain(fresh.memory.id);
  });

  it("edits through the guard and deletes for good", async () => {
    const { memory } = await mem.remember({ kind: "what_worked", text: `[Sample] Superbill posts got saves (${tag})` }, by);
    made.push(memory.id);
    await expect(mem.editMemory(memory.id, { text: `Mr. Grimsby${tag} liked it` }, by)).rejects.toMatchObject({ kind: "client_name" });
    expect((await mem.getMemory(memory.id))?.text).toContain("Superbill");
    expect(await mem.deleteMemory(memory.id, by)).toBe(true);
    expect(await mem.getMemory(memory.id)).toBeNull();
  });
});
