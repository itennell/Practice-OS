// A chat title shows on every page, so anything the guards would refuse becomes "New chat".
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The read path must never load the name-finder: fail the test if it is touched.
vi.mock("../lib/aeon/phi-classifier", () => ({
  findNames: () => {
    throw new Error("the name-finder ran on read");
  },
  loadNameFinder: () => {
    throw new Error("the name-finder ran on read");
  },
}));

const { NEUTRAL_TITLE, forgetCheckedTitles, plainRefuses, safeTitle, shownTitle, titleFrom, titleReadings } = await import("../lib/aeon/chat-title");
type TitleCheck = Parameters<typeof safeTitle>[1] & {};

const pass: TitleCheck = async (text) => ({ ok: true, text });
const refuseName = (name: string): TitleCheck => async (text) => (text.toLowerCase().includes(name.toLowerCase()) ? { ok: false, kind: "client_name" } : { ok: true, text });

beforeEach(() => forgetCheckedTitles());

describe("safeTitle (on save: plain code, then the whole guard)", () => {
  it("keeps a practice question as the title", async () => {
    expect(await safeTitle("Find oncology practices near 60614", pass)).toBe("Find oncology practices near 60614");
  });

  it("cuts a long first message short", async () => {
    const long = "Draft a letter to the hospice on Clark Street about how I take referrals and what plans I accept";
    expect(await safeTitle(long, pass)).toBe(titleFrom(long));
    expect(titleFrom(long).length).toBeLessThanOrEqual(60);
  });

  it("uses New chat when the plain-code rules refuse the text", async () => {
    expect(await safeTitle("My client Sarah Klein has PTSD", pass)).toBe(NEUTRAL_TITLE);
  });

  it("reads look-alikes as letters, so the stress-test title is refused (wave 4 finding)", async () => {
    expect(await safeTitle("My cl1ent S4rah K1ein has PTSD", refuseName("Sarah Klein"))).toBe(NEUTRAL_TITLE);
    expect(await safeTitle("talked with m@ri$ g9rcia", refuseName("maris"))).toBe(NEUTRAL_TITLE);
    expect(await safeTitle("talked with S.a.r.a.h K-l-e-i-n", refuseName("Sarah Klein"))).toBe(NEUTRAL_TITLE);
  });

  it("leaves numbers that are not letters alone", async () => {
    expect(titleReadings("Who refers in 60614?")).toEqual(["Who refers in 60614?"]);
    expect(await safeTitle("Who refers in 60614?", refuseName("6o614"))).toBe("Who refers in 60614?");
  });

  it("uses New chat for a crisis message", async () => {
    expect(await safeTitle("I want to kill myself", pass)).toBe(NEUTRAL_TITLE);
  });

  it("fails closed when the guard can't run", async () => {
    expect(await safeTitle("Find hospices", async () => ({ ok: false, kind: "unavailable" }))).toBe(NEUTRAL_TITLE);
    expect(await safeTitle("Find hospices", async () => { throw new Error("down"); })).toBe(NEUTRAL_TITLE);
  });
});

describe("shownTitle (on read: plain code only)", () => {
  it("hides an old title the rules now refuse, without the name-finder", () => {
    expect(shownTitle("My cl1ent S4rah K1ein has PTSD")).toBe(NEUTRAL_TITLE);
    expect(shownTitle("I don't want to be here anymore")).toBe(NEUTRAL_TITLE);
  });

  it("shows a title that still passes", () => {
    expect(shownTitle("Referral letters")).toBe("Referral letters");
    expect(plainRefuses("Referral letters")).toBe(false);
  });

  it("keeps a verdict for a minute, then checks again", () => {
    expect(shownTitle("Referral letters", 1_000)).toBe("Referral letters");
    expect(shownTitle("Referral letters", 30_000)).toBe("Referral letters");
    expect(shownTitle("Referral letters", 200_000)).toBe("Referral letters");
  });

  it("keys its cache by a hash, never the title text", () => {
    const src = readFileSync(new URL("../lib/aeon/chat-title.ts", import.meta.url), "utf8");
    expect(src).toMatch(/createHash\("sha256"\)\.update\(title\)/);
    expect(src).not.toMatch(/checked\.(set|get)\(title/);
  });
});
