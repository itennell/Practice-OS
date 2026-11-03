// A chat title shows on every page, so anything the guards would refuse becomes "New chat".
import { beforeEach, describe, expect, it } from "vitest";
import { NEUTRAL_TITLE, forgetCheckedTitles, safeTitle, shownTitle, titleFrom, type TitleCheck } from "../lib/aeon/chat-title";
import { checkIdentity } from "../lib/aeon/identity-filter";

// Layer 1 of the guard (plain-code rules) stands in for the whole guard here,
// so this runs without the name-finder model.
const rulesOnly: TitleCheck = async (text) => {
  const r = checkIdentity(text, { names: [], contacts: [] });
  return r.ok ? { ok: true, text } : r;
};
const refuseName = (name: string): TitleCheck => async (text) => (text.includes(name) ? { ok: false, kind: "client_name" } : { ok: true, text });

beforeEach(() => forgetCheckedTitles());

describe("safeTitle", () => {
  it("keeps a practice question as the title", async () => {
    expect(await safeTitle("Find oncology practices near 60614", rulesOnly)).toBe("Find oncology practices near 60614");
  });

  it("cuts a long first message short", async () => {
    const long = "Draft a letter to the hospice on Clark Street about how I take referrals and what plans I accept";
    expect(await safeTitle(long, rulesOnly)).toBe(titleFrom(long));
    expect(titleFrom(long).length).toBeLessThanOrEqual(60);
  });

  it("uses New chat when the guard refuses the text", async () => {
    expect(await safeTitle("My client Sarah Klein has PTSD", rulesOnly)).toBe(NEUTRAL_TITLE);
  });

  it("reads digits as letters, so the stress-test title is refused (wave 4 finding)", async () => {
    expect(await safeTitle("My cl1ent S4rah K1ein has PTSD", refuseName("Sarah Klein"))).toBe(NEUTRAL_TITLE);
    expect(await safeTitle("My cl1ent S4rah K1ein has PTSD", refuseName("Sarah Kiein"))).toBe(NEUTRAL_TITLE);
  });

  it("leaves numbers that are not letters alone", async () => {
    expect(await safeTitle("Who refers in 60614?", refuseName("6o614"))).toBe("Who refers in 60614?");
  });

  it("uses New chat for a crisis message", async () => {
    expect(await safeTitle("I want to kill myself", rulesOnly)).toBe(NEUTRAL_TITLE);
  });

  it("fails closed when the check can't run", async () => {
    expect(await safeTitle("Find hospices", async () => ({ ok: false, kind: "unavailable" }))).toBe(NEUTRAL_TITLE);
    expect(await safeTitle("Find hospices", async () => { throw new Error("down"); })).toBe(NEUTRAL_TITLE);
  });
});

describe("shownTitle (saved titles, checked again on read)", () => {
  it("hides an old title the guard now refuses", async () => {
    expect(await shownTitle("my clinet maria g. is pregnant and has postpartum depresion", refuseName("maria"))).toBe(NEUTRAL_TITLE);
  });

  it("shows a title that still passes, and remembers it", async () => {
    let calls = 0;
    const counting: TitleCheck = async (text) => {
      calls++;
      return { ok: true, text };
    };
    expect(await shownTitle("Referral letters", counting)).toBe("Referral letters");
    const after = calls;
    expect(await shownTitle("Referral letters", counting)).toBe("Referral letters");
    expect(calls).toBe(after);
  });

  it("does not remember a title it could not check", async () => {
    expect(await shownTitle("Referral letters", async () => ({ ok: false, kind: "unavailable" }))).toBe(NEUTRAL_TITLE);
    expect(await shownTitle("Referral letters", async (text) => ({ ok: true, text }))).toBe("Referral letters");
  });
});
