// Front Desk privacy: full caller numbers never reach UI-facing values.
// Approval titles and previews carry the masked number; the inquiry list too.
// Pure checks, no database.
import { describe, expect, it } from "vitest";
import { approvalWho, maskPhone } from "../lib/frontdesk/redact";
import { displayWho } from "../lib/frontdesk/view";

const FULL = "+13125550144";

function showsFullNumber(s: string): boolean {
  const digits = s.replace(/\D/g, "");
  return digits.includes("13125550144") || digits.includes("3125550144");
}

describe("masked caller identity in UI-facing values", () => {
  it("names the caller by her saved name when there is one", () => {
    expect(approvalWho("Sam", FULL)).toBe("Sam");
    expect(displayWho("Sam", FULL, null)).toBe("Sam");
  });

  it("masks the number down to the last four digits, never the full number", () => {
    expect(approvalWho(null, FULL)).toBe("(•••) •••-0144");
    expect(displayWho(null, FULL, null)).toBe("(•••) •••-0144");
    expect(maskPhone(FULL)).toBe("(•••) •••-0144");
    for (const s of [approvalWho(null, FULL), displayWho(null, FULL, null), maskPhone(FULL)]) {
      expect(showsFullNumber(s)).toBe(false);
      expect(s).toContain("0144");
    }
  });

  it("approval titles and previews built from a number show only the masked form", () => {
    const title = `Text ${approvalWho(null, FULL)} 3 consult times`;
    const to = maskPhone(FULL);
    expect(title).toBe("Text (•••) •••-0144 3 consult times");
    expect(showsFullNumber(title)).toBe(false);
    expect(showsFullNumber(to)).toBe(false);
  });

  it("falls back plainly when there is no name or number", () => {
    expect(approvalWho(null, null)).toBe("Hidden number");
    expect(displayWho(null, null, null)).toBe("Unknown caller");
    expect(displayWho(null, null, null, "Caller")).toBe("Caller");
    expect(displayWho(null, null, "sam@example.com")).toBe("sam@example.com");
  });
});
