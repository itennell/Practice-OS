// The feed preview cuts the caption like Instagram, before "more".
import { describe, expect, it } from "vitest";
import { shortCaption } from "../components/instagram/post-preview";
import { postState, STATE } from "../components/instagram/post-state";

describe("shortCaption", () => {
  it("keeps a short one-line caption whole", () => {
    expect(shortCaption("Sessions are $150.")).toEqual({ text: "Sessions are $150.", cut: false });
  });
  it("cuts at the first line break, without a trailing period before the dots", () => {
    expect(shortCaption("Book a free call from the link in my bio.\n\nDana Reyes, LCPC")).toEqual({ text: "Book a free call from the link in my bio", cut: true });
  });
  it("cuts a long first line on a word", () => {
    const r = shortCaption(`${"word ".repeat(40)}end`);
    expect(r.cut).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(125);
    expect(r.text.endsWith("word")).toBe(true);
  });
});

describe("postState", () => {
  it("a draft with no approval is never counted as waiting, and is offered a retry", () => {
    expect(postState({ status: "pending_approval", approvalStatus: null, approvalId: null })).toBe("retry");
    expect(postState({ status: "pending_approval", approvalStatus: "pending", approvalId: "a" })).toBe("waiting");
  });
  it("a failed approval (no finished picture) is a retry, not gone", () => {
    expect(postState({ status: "failed", approvalStatus: "failed", approvalId: "a" })).toBe("retry");
    expect(STATE.retry.label).toBe("Didn't finish");
  });
  it("a draft not yet sent is a Draft, not a failure and not waiting", () => {
    expect(postState({ status: "draft", approvalStatus: null, approvalId: null })).toBe("draft");
    expect(STATE.draft.label).toBe("Draft");
  });
  it("ready, blocked and declined keep their own labels", () => {
    expect(postState({ status: "ready", approvalStatus: "done", approvalId: "a" })).toBe("ready");
    expect(postState({ status: "blocked", approvalStatus: null, approvalId: null })).toBe("blocked");
    expect(postState({ status: "pending_approval", approvalStatus: "rejected", approvalId: "a" })).toBe("declined");
  });
});
