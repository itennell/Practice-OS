// The agent never signs, attests or submits a government, payer or CAQH form
// (AGENTS.md). Nothing that acts on her behalf may even be named for it: every
// MCP tool, approval kind and executor is checked here, so adding one fails
// this test until a person decides otherwise.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPROVAL_KINDS } from "../lib/approval-kinds";
import { TOOLS } from "../lib/aeon/tools";
import { editableField, executors } from "../lib/executors";

const FORBIDDEN = /attest|submit|(^|_)e?_?sign(_|$)|signature|certif/i;

// Every MCP and chat tool comes from one list, lib/aeon/tools.ts.
const server = readFileSync(new URL("../mcp/server.ts", import.meta.url), "utf8");
const mcpTools = TOOLS.map((t) => t.name);

describe("nothing can attest, sign or submit", () => {
  it("finds the MCP tools (guards against the list silently being empty)", () => {
    expect(mcpTools).toEqual(
      expect.arrayContaining(["status", "queue_approval", "morning_brief", "research_state_rules", "recheck_rules", "update_facts", "answer_setup", "log_event", "remember", "forget"]),
    );
  });

  it("the MCP server registers no tool outside that list", () => {
    expect(server).not.toMatch(/registerTool\(\s*["'`]/);
    expect(server).toMatch(/for \(const tool of TOOLS\)/);
  });

  it.each(mcpTools)("MCP tool %s", (name) => expect(name).not.toMatch(FORBIDDEN));
  it.each([...APPROVAL_KINDS])("approval kind %s", (kind) => expect(kind).not.toMatch(FORBIDDEN));
  it.each(Object.keys(executors))("executor %s", (kind) => expect(kind).not.toMatch(FORBIDDEN));

  it("every executor matches an approval kind (no hidden actions)", () => {
    for (const k of [...Object.keys(executors), ...Object.keys(editableField)]) expect(APPROVAL_KINDS).toContain(k);
  });

  it("the pattern does catch the names it must refuse", () => {
    for (const bad of ["caqh_attest", "submit_pecos", "e_sign", "sign", "medicare_certification", "esign"]) {
      expect(bad).toMatch(FORBIDDEN);
    }
    for (const ok of ["state_rules", "consult_booking", "design_post", "assign_task"]) expect(ok).not.toMatch(FORBIDDEN);
  });
});
