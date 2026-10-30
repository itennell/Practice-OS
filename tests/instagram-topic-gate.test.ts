// What she types in the Instagram box, checked before anything is written.
import { describe, expect, it } from "vitest";
import { gateTopic, illnessTopic, nearestAngle, nearestAngles } from "../lib/instagram/topic-gate";

describe("gateTopic", () => {
  it.each([
    "how to work through anxiety",
    "How do I get over grief?",
    "ways to cope with stress",
    "tips for panic attacks",
    "help with managing depression",
    "what to do when you feel anxious",
    "coping skills for teens",
    "What helps with anxiety",
    "what works for grief",
    "tips for sleeping better",
    "tips for burnout",
    "how to avoid burnout",
    "how to prevent burnout",
    "mindfulness for anxiety",
    "meditation for stress",
  ])("advice: %s", (request) => {
    const g = gateTopic(request);
    expect(g.ok).toBe(false);
    if (g.ok || g.hardStop) throw new Error("unreachable");
    expect(g.rule).toBe("advice");
    expect(g.why).toMatch(/^Posts stay on how your practice works/);
    expect(g.angle.pillar).toBe("first_session");
  });

  it.each([
    "what a first session for anxiety looks like",
    "how superbills work",
    "how to book a free consult",
    "do you take Blue Cross",
    "meet the clinician",
    "video sessions from home",
    "I see couples and teens in Lincoln Park",
  ])("logistics passes: %s", (request) => {
    expect(gateTopic(request)).toEqual({ ok: true });
  });

  it("names the subject in the offer", () => {
    expect(nearestAngle("how to work through anxiety").label).toBe("What a first session for anxiety looks like");
    expect(nearestAngle("ways to feel better").label).toBe("What your first session looks like");
  });

  it("self-harm is a hard stop with 988", () => {
    const g = gateTopic("a post for suicide prevention month");
    expect(g).toMatchObject({ ok: false, hardStop: true, rule: "self_harm" });
    expect(!g.ok && g.why).toMatch(/988/);
  });

  it("advice about depression is explained, with three logistics angles to pick", () => {
    const g = gateTopic("how to cope with depression");
    if (g.ok || g.hardStop) throw new Error("unreachable");
    expect(g.why).toBe("Posts stay on how your practice works, so Aeon can't write advice about depression.");
    expect(g.angles.map((a) => a.label)).toEqual([
      "What a first session for depression looks like",
      "What sessions for depression cost",
      "How to book a first session for depression",
    ]);
    // Every offered angle passes the gate itself, so picking one always writes.
    for (const a of g.angles) {
      expect(gateTopic(a.label)).toEqual({ ok: true });
      expect(illnessTopic(a.label)).toBeNull();
    }
  });

  it("client stories and reviews are offered a logistics angle too", () => {
    expect(gateTopic("a client of mine who got better")).toMatchObject({ ok: false, rule: "client_story" });
    expect(gateTopic("ask clients to leave a review")).toMatchObject({ ok: false, rule: "testimonial" });
  });
});

// QA (2026-10-29): "a post about depression" passed every check, then Muse's draft added a 988
// crisis line, the critic held it back as self-harm, and nothing came up.
describe("illnessTopic", () => {
  it.each(["a post about depression", "depression", "Depression.", "a post about anxiety", "grief", "posts about trauma"])("a bare illness topic is redirected: %s", (request) => {
    expect(gateTopic(request)).toEqual({ ok: true });
    const ill = illnessTopic(request);
    expect(ill).not.toBeNull();
    expect(ill!.why).toMatch(/^Posts stay on how your practice works, so Aeon writes about the logistics around \w+/);
    expect(ill!.angles.map((a) => a.pillar)).toEqual(["first_session", "fees_superbills", "how_to_book"]);
  });

  it("names depression in the explanation and the angles", () => {
    expect(illnessTopic("a post about depression")).toEqual({
      why: "Posts stay on how your practice works, so Aeon writes about the logistics around depression: what a first session is like, what it costs and how to book.",
      angles: nearestAngles("depression"),
    });
  });

  it.each([
    "what a first session for depression looks like",
    "therapy for depression in Lincoln Park",
    "what sessions for anxiety cost",
    "how to book a consult for grief",
    "I see couples and teens in Lincoln Park",
    "how superbills work",
  ])("logistics around an illness, or no illness, passes: %s", (request) => {
    expect(illnessTopic(request)).toBeNull();
  });

  it("self-harm stays the hard stop with the fixed 988 text", () => {
    expect(gateTopic("a post about depression and suicide")).toMatchObject({ ok: false, hardStop: true, rule: "self_harm" });
  });
});
