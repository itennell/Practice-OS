// The Instagram content coach (lib/instagram/coach.ts): ideas honor her topics and
// never-show list, rule breakers are dropped, self-harm blocks the batch, and
// "draft the second one" turns idea 2 into a pending approval. Models stubbed.
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "../lib/db";
import { breaksNeverShow, checkIdeas, draftIdea, latestIdeas, NEUTRAL_PICTURE, planDays, postIdeas } from "../lib/instagram/coach";
import type { ChatFn } from "../lib/instagram/critic";
import { DEFAULT_PREFS, instagramQuestions, saveInstagramPrefs } from "../lib/instagram/onboarding";
import { listPosts } from "../lib/instagram/store";

const hasDb = Boolean(process.env.DATABASE_URL);
const check = { topics: ["how_to_book", "fees_superbills"] as const, neverShow: ["face", "office"], firstName: "Dana", feesCents: [17500] };
const idea = (o: Record<string, unknown> = {}) => ({
  topic: "how_to_book",
  hook: "Booking takes three steps.",
  points: ["Tap the link in my bio.", "Pick a time for a free call."],
  call_to_action: "Pick a time today.",
  picture: "A calendar page with one day circled.",
  ...o,
});

describe("checking ideas in plain code", () => {
  it("keeps only her topics", () => {
    const c = checkIdeas([idea(), idea({ topic: "meet_the_clinician" })], { ...check, topics: [...check.topics] });
    expect(c.kept.map((i) => i.topic)).toEqual(["how_to_book"]);
    expect(c.dropped).toBe(1);
  });

  it("replaces a picture that shows what she never shows", () => {
    const c = checkIdeas(
      [idea({ picture: "Dana smiling at her desk." }), idea({ topic: "fees_superbills", picture: "A folder on an office shelf." })],
      { ...check, topics: [...check.topics] },
    );
    expect(c.kept.map((i) => i.picture)).toEqual([NEUTRAL_PICTURE.how_to_book, NEUTRAL_PICTURE.fees_superbills]);
    expect(breaksNeverShow("A plant by a window.", ["face", "office", "family", "home"], "Dana")).toBe(false);
    expect(breaksNeverShow("Her kids at the park.", ["family"])).toBe(true);
  });

  it("drops advice, client stories and testimonials; self-harm blocks the whole batch", () => {
    const c = checkIdeas(
      [idea({ hook: "Signs that you are depressed" }), idea({ points: ["A client of mine finally felt better.", "Book now."] }), idea({ call_to_action: "Leave us a review!" }), idea()],
      { ...check, topics: [...check.topics] },
    );
    expect(c.kept).toHaveLength(1);
    expect(c.dropped).toBe(3);
    expect(checkIdeas([idea(), idea({ hook: "September is suicide prevention month" })], { ...check, topics: [...check.topics] })).toMatchObject({ kept: [], blocked: true });
  });

  it("plans her days at 1, 3 or 5 a week", () => {
    // 2026-10-29 is a Thursday.
    expect(planDays(1, "2026-10-29")).toEqual(["2026-11-03"]);
    expect(planDays(3, "2026-10-29")).toEqual(["2026-10-30", "2026-11-02", "2026-11-04"]);
    expect(planDays(5, "2026-10-29")).toHaveLength(5);
  });
});

/** Ideas and drafts by feature, like the real models would. */
function stub(ideas: unknown[]) {
  return (async (feature: string, params: { messages: { content: unknown }[] }) => {
    const reply = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
    if (feature === "instagram.ideas") return reply({ ideas });
    if (feature === "instagram.write") {
      const ask = String(params.messages.at(-1)?.content);
      const pillar = ["how_to_book", "fees_superbills"].find((p) => ask.includes(`"${p}"`)) ?? "how_to_book";
      return reply({ posts: [{ pillar, headline: "How paying works", body: "We give you a superbill to send to your insurance. Book a free call from the link in my bio.", alt_text: "A calm background with the headline" }] });
    }
    if (feature === "instagram.critic") return reply({ breaks: [] });
    if (feature === "instagram.graphic_check") return reply({ ok: true, problems: [] });
    throw new Error(`unexpected model call ${feature}`);
  }) as unknown as ChatFn;
}
const graphic = {
  cutout: async () => null,
  background: () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#EDE7F6" } }).png().toBuffer(),
};

describe.skipIf(!hasDb)("ideas from her saved answers, then a draft", () => {
  afterAll(async () => {
    await saveInstagramPrefs(DEFAULT_PREFS);
    await db()`delete from practice_os.posts where is_sample = true and status = 'idea'`;
    await closeDb();
  });

  it("three ideas on her topics only, safe pictures, [Sample] on the demo practice; 'draft the second one' queues idea 2", async () => {
    process.env.DRY_RUN = "true";
    await instagramQuestions.save({ account: "has", topics: ["how_to_book", "fees_superbills"], posts_per_week: "3", never_show: ["face", "office"], style: { pick: "plain", example: "" } });
    const chat = stub([
      idea(),
      idea({ topic: "fees_superbills", hook: "How paying for sessions works.", picture: "Dana at her office desk with a laptop." }),
      idea({ topic: "meet_the_clinician" }), // not one of her topics: replaced by a fixed idea on hers
    ]);
    const r = await postIdeas("test", { count: 3, chat, hasKey: true });
    expect(r.sample).toBe(true);
    expect(r.ideas.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(r.ideas.every((i) => ["how_to_book", "fees_superbills"].includes(i.topic))).toBe(true);
    expect(r.ideas[1].picture).toBe(NEUTRAL_PICTURE.fees_superbills);
    expect(r.ideas.every((i) => !breaksNeverShow(i.picture, ["face", "office"], "Dana"))).toBe(true);
    expect(r.dropped).toBe(1);

    // Ideas aren't posts: the Instagram list and list_instagram_posts leave them out.
    expect((await listPosts()).some((p) => p.status === "idea")).toBe(false);
    expect((await latestIdeas()).map((i) => i.hook)).toEqual(r.ideas.map((i) => i.hook));

    const d = await draftIdea("test", { number: 2 }, { chat, graphic });
    expect(d.found && d.idea.hook).toBe("How paying for sessions works.");
    expect(d.found && d.outcome).toBe("queued");
    const approvalId = d.found && d.outcome !== "blocked" ? d.post.approvalId : null;
    const [a] = await db()<{ kind: string; status: string }[]>`select kind, status from practice_os.approvals where id = ${approvalId}`;
    expect(a).toEqual({ kind: "instagram_post", status: "pending" });

    expect(await draftIdea("test", { number: 5 })).toMatchObject({ found: false });
  }, 120_000);

  it("the weekly plan gives one dated idea per post day", async () => {
    const r = await postIdeas("test", { plan: true, hasKey: false, today: "2026-10-29" });
    expect(r.source).toBe("fixed");
    expect(r.ideas.map((i) => i.day)).toEqual(["2026-10-30", "2026-11-02", "2026-11-04"]);
  });
});
