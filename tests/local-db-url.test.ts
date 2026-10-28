// db() without DATABASE_URL joins the built-in database the app already started.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { builtInDatabaseUrl } from "../lib/local-db-url";

const saved = { dir: process.env.PRACTICE_OS_DATA_DIR, vercel: process.env.VERCEL };
afterEach(() => {
  if (saved.dir) process.env.PRACTICE_OS_DATA_DIR = saved.dir;
  else delete process.env.PRACTICE_OS_DATA_DIR;
  if (saved.vercel) process.env.VERCEL = saved.vercel;
  else delete process.env.VERCEL;
});

describe("built-in database address", () => {
  it("is read from the data folder, and only off Vercel", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "practice-os-url-"));
    try {
      process.env.PRACTICE_OS_DATA_DIR = dir;
      expect(builtInDatabaseUrl()).toBeNull(); // nothing started yet
      await writeFile(path.join(dir, "local-db.json"), JSON.stringify({ port: 55001, user: "practiceos", password: "p/w+=", database: "practice" }));
      expect(builtInDatabaseUrl()).toBe("postgres://practiceos:p%2Fw%2B%3D@127.0.0.1:55001/practice");
      process.env.VERCEL = "1";
      expect(builtInDatabaseUrl()).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
