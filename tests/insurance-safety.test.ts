// Insurance submission safety: chat wording can never mark an application
// sent. Only her own change on the Insurance page records Applied.
// Pure checks on the tool schema and wording, no database.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TOOLS_BY_NAME } from "../lib/aeon/tools";
import { CHAT_SET_STATUSES, STATUSES } from "../lib/payers/store";

const tool = TOOLS_BY_NAME.get("update_payer_application")!;
const parse = (status: string) => z.object(tool.input).safeParse({ payer: "BCBSIL", status });

describe("update_payer_application can never record a sent application", () => {
  it("stays exactly one status behind the full list: applied", () => {
    expect(tool).toBeDefined();
    expect([...CHAT_SET_STATUSES, "applied"].sort()).toEqual([...STATUSES].sort());
  });

  it("rejects status applied, accepts the rest", () => {
    expect(parse("applied").success).toBe(false);
    for (const status of CHAT_SET_STATUSES) {
      expect(parse(status).success).toBe(true);
    }
  });

  it("no longer teaches the sent-my-words example", () => {
    expect(tool.description).not.toContain("I sent my");
    expect(tool.description).toContain("only her own change");
  });
});
