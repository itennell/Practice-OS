// What she types in the Instagram box, checked before anything is written.
import { describe, expect, it } from "vitest";
import { gateTopic, nearestAngle } from "../lib/instagram/topic-gate";

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

  it("client stories and reviews are offered a logistics angle too", () => {
    expect(gateTopic("a client of mine who got better")).toMatchObject({ ok: false, rule: "client_story" });
    expect(gateTopic("ask clients to leave a review")).toMatchObject({ ok: false, rule: "testimonial" });
  });
});
