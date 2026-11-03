// The Referrals "Ask Aeon" box adds the picked partners' board names to her message.
// A board name must pass the chat's privacy guard (lib/aeon/guard.ts, the real local
// name-finder), the same as a message naming that partner, or the box would refuse
// every question about a picked partner. The allowlist is passed in, as the chat
// builds it from her board (practiceAllowlist).
import { describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const { guard } = await import("../lib/aeon/guard");
const { withContext } = await import("../lib/referrals/ask-context");

const BOARD = ["[Sample] Dr. Robin Example, PsyD", "[Sample] Juniper Row Family Medicine", "[Sample] Clark Street Psychology"];
const allow = { names: BOARD, contacts: [], directory: BOARD };

describe("Ask Aeon context and the privacy guard", () => {
  it("passes with picked board names", async () => {
    const text = withContext("Who should I call first this week?", "Partners", [
      { id: "00000000-0000-4000-8000-000000000206", name: BOARD[0] },
      { id: "00000000-0000-4000-8000-000000000201", name: BOARD[1] },
    ]);
    const r = await guard(text, "message", allow);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  }, 180_000);

  it("still refuses a client detail typed next to a picked partner", async () => {
    const text = withContext("My client Joe Smith needs a psychiatrist, can Robin take him?", "Partners", [{ id: "00000000-0000-4000-8000-000000000206", name: BOARD[0] }]);
    const r = await guard(text, "message", allow);
    expect(r.ok).toBe(false);
  }, 180_000);
});
