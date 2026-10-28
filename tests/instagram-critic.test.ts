// The Instagram critic: the plain-code pass over a labeled set, and the Muse
// pass with a stubbed model (no network).
import { describe, expect, it } from "vitest";
import { codeCritic, critique, museCritic, type ChatFn, type CriticRule } from "../lib/instagram/critic";
import { CRITIC_CASES } from "./fixtures/instagram/critic-cases";

const LICENSE = "Dana Reyes, LCPC (fictional demo practice)";
const ctx = { licenseLine: LICENSE, feesCents: [17500] };
const withLine = (text: string, noLicense?: boolean) => (noLicense ? text : `${text}\n\n${LICENSE}`);

describe("plain-code critic over the labeled set", () => {
  const wrongPass: string[] = [];
  const wrongBlock: string[] = [];
  for (const c of CRITIC_CASES) {
    const got = codeCritic(withLine(c.text, c.noLicense), ctx).findings.map((f) => f.rule);
    for (const rule of c.block) if (!got.includes(rule)) wrongPass.push(`${rule}: ${c.text}`);
    for (const rule of got) if (!c.block.includes(rule)) wrongBlock.push(`${rule}: ${c.text}`);
  }

  it(`has at least 30 cases (${CRITIC_CASES.length})`, () => {
    expect(CRITIC_CASES.length).toBeGreaterThanOrEqual(30);
  });
  it("lets no unsafe post through (wrong passes)", () => {
    expect(wrongPass).toEqual([]);
  });
  it("blocks no logistics post (wrong blocks)", () => {
    expect(wrongBlock).toEqual([]);
  });
});

describe("hard stop", () => {
  it("blocks suicide and self-harm with no rewrite, and never asks the model", async () => {
    let called = false;
    const r = await critique(withLine("Suicide prevention month: let's talk."), ctx, {
      chat: (async () => {
        called = true;
        throw new Error("should not be called");
      }) as unknown as ChatFn,
    });
    expect(r).toMatchObject({ ok: false, hardStop: true });
    expect(r.findings[0].message).toMatch(/988/);
    expect(called).toBe(false);
  });
});

const museSays = (breaks: unknown): ChatFn =>
  (async () => ({ choices: [{ message: { content: JSON.stringify({ breaks }) } }] })) as unknown as ChatFn;

describe("Muse check", () => {
  it("adds what plain code missed", async () => {
    const r = await critique(withLine("Lots of people find their footing after a few weeks with us."), ctx, { chat: museSays(["outcome_promise"]) });
    expect(r.ok).toBe(false);
    expect(r.findings).toEqual([expect.objectContaining({ rule: "outcome_promise", by: "muse" })]);
  });

  it("can never lift a code block", async () => {
    const r = await critique(withLine("A client of mine finally booked."), ctx, { chat: museSays([]) });
    expect(r.ok).toBe(false);
    expect(r.findings.map((f) => f.rule)).toContain("client_story");
  });

  it("ignores rules it isn't allowed to report", async () => {
    const found = await museCritic("x", museSays(["license_line", "made_up", "advice", "advice"]));
    expect(found.map((f) => f.rule)).toEqual<CriticRule[]>(["advice"]);
  });

  it("holds the post back when the answer isn't readable", async () => {
    const garbled = (async () => ({ choices: [{ message: { content: "not json" } }] })) as unknown as ChatFn;
    await expect(museCritic("x", garbled)).rejects.toThrow(/held back/);
  });
});
