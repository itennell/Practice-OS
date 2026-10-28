// make_release_form through the shared tool runner (chat and MCP). Needs the
// database only for "today"; nothing is written by the tool.
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);
const { closeDb } = await import("../lib/db");
const { runTool } = await import("../lib/aeon/tools");
const { getReleaseDraft } = await import("../lib/release/drafts");

afterAll(async () => {
  if (hasDb) await closeDb();
});

describe.skipIf(!hasDb)("make_release_form", () => {
  it("refuses without an expiration date and says why", async () => {
    const r = await runTool("make_release_form", { recipient: "Dr. Lee [Sample]" }, { by: "test" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/expires_on/);
  });

  it("refuses a blanket release", async () => {
    const r = await runTool("make_release_form", { information: "all records", expires_on: "2099-01-01" }, { by: "test" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/blanket/);
  });

  it("fills the boxes, keeps them only in memory and links to the tab", async () => {
    const r = await runTool(
      "make_release_form",
      { recipient: "Dr. Lee [Sample]", purpose: "Coordinate care", information: "Dates of attendance", expires_on: "2099-01-01", client_name: "Jordan" },
      { by: "test" },
    );
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content[0].text);
    const draft = new URL(out.open, "http://x").searchParams.get("draft")!;
    expect(out.open).toMatch(/^\/paperwork\?tab=release&draft=/);
    expect(getReleaseDraft(draft)).toEqual({ recipient: "Dr. Lee [Sample]", purpose: "Coordinate care", information: "Dates of attendance", expires_on: "2099-01-01" });
    expect(out.left_for_her).toEqual(expect.arrayContaining(["client name", "client date of birth", "signatures"]));
  });
});
