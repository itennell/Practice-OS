// Plan a week and ask for one post, end to end against a throwaway local
// Postgres, with every model call stubbed (no network). Checkpoint case:
// "a client of mine who…" is never written as asked.
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "../lib/db";
import type { ChatFn } from "../lib/instagram/critic";
import { PILLARS } from "../lib/instagram/pillars";
import { listPosts, planWeek, practiceFacts, requestPost } from "../lib/instagram/store";

const hasDb = Boolean(process.env.DATABASE_URL);
let LICENSE = "";
let FEE = "";

const logistics: Record<string, { headline: string; body: string }> = {
  first_session: { headline: "Your first session", body: "Your first session is 50 minutes. We go over paperwork and what brings you in." },
  fees_superbills: { headline: "What a session costs", body: "Sessions are FEE. We give you a superbill to send to your insurance." },
  how_to_book: { headline: "How to book", body: "Start with a free 15-minute phone call, then pick a time. Link in bio." },
  meet_the_clinician: { headline: "Meet Dana", body: "Dana is a licensed counselor in Lincoln Park, Chicago." },
  office_telehealth: { headline: "Office and video", body: "See us in Lincoln Park or by secure video anywhere in Illinois." },
};

/** Answers by feature, like the real models would. `firstWrite` lets one test feed a bad first draft. */
function stubModels(opts: { firstWrite?: { pillar: string; headline: string; body: string } } = {}) {
  const seen: string[] = [];
  let writes = 0;
  const chat = (async (feature: string, params: { messages: { content: unknown }[] }) => {
    seen.push(feature);
    const reply = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
    if (feature === "instagram.write") {
      writes++;
      const ask = String(params.messages.at(-1)?.content);
      if (opts.firstWrite && writes === 1) return reply({ posts: [{ ...opts.firstWrite, alt_text: "Dana smiling" }] });
      const ids = PILLARS.map((p) => p.id).filter((id) => ask.includes(`"${id}"`));
      return reply({
        posts: ids.map((id) => ({ pillar: id, ...logistics[id], body: logistics[id].body.replace("FEE", FEE), alt_text: "Dana smiling beside the headline" })),
      });
    }
    if (feature === "instagram.critic") return reply({ breaks: [] });
    if (feature === "instagram.graphic_check") return reply({ ok: true, problems: [] });
    throw new Error(`unexpected model call ${feature}`);
  }) as unknown as ChatFn;
  return { chat, seen };
}

const graphic = {
  cutout: async () => null,
  background: () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#EDE7F6" } }).png().toBuffer(),
};

beforeAll(async () => {
  if (!hasDb) return;
  process.env.DRY_RUN = "true";
  // Read Dana's seeded profile; never change it (other test files share it).
  const facts = await practiceFacts();
  LICENSE = facts.licenseLine;
  FEE = `$${facts.fees[0].cents / 100}`;
  await db()`delete from practice_os.posts where is_sample = false`;
});

afterAll(async () => {
  if (!hasDb) return;
  await db()`delete from practice_os.posts where is_sample = false`;
  await closeDb();
});

describe.skipIf(!hasDb)("Instagram posts", () => {
  it("plans five posts, one per pillar, each with a picture and a pending approval", async () => {
    const { chat } = stubModels();
    const r = await planWeek("test", { chat, graphic });
    expect(r.saved).toHaveLength(5);
    expect(r.blocked).toBe(0);
    const posts = await listPosts({ week: r.week });
    expect(posts.map((p) => p.pillar).sort()).toEqual(PILLARS.map((p) => p.id).sort());
    for (const p of posts) {
      expect(p.caption.endsWith(LICENSE)).toBe(true);
      expect(p.hasImage).toBe(true);
      expect(p.approvalStatus).toBe("pending");
    }
  });

  it("never writes 'a client of mine who…'; it writes a logistics post and says why", async () => {
    const { chat } = stubModels();
    const r = await requestPost("test", "Make a post about a client of mine who finally got her life back", null, { chat, graphic });
    expect(r.outcome).toBe("rewritten");
    if (r.outcome === "blocked") throw new Error("unreachable");
    expect(r.why).toMatch(/client's story/);
    const [post] = await db()`select caption, status from practice_os.posts where id = ${r.post.id}`;
    expect(post.caption).not.toMatch(/client of mine/i);
    expect(post.status).toBe("pending_approval");
  });

  it("rewrites a draft that tells a story, once", async () => {
    const { chat } = stubModels({ firstWrite: { pillar: "first_session", headline: "A first session", body: "One of my clients told me her first session was easy." } });
    const r = await requestPost("test", "a post about first sessions", "first_session", { chat, graphic });
    expect(r.outcome).toBe("rewritten");
  });

  it("refuses suicide or self-harm outright, with no model call and nothing saved", async () => {
    const { chat, seen } = stubModels();
    const before = (await listPosts()).length;
    const r = await requestPost("test", "a post for suicide prevention month", null, { chat, graphic });
    expect(r).toMatchObject({ outcome: "blocked" });
    expect(r.outcome === "blocked" && r.why).toMatch(/988/);
    expect(seen).toEqual([]);
    expect((await listPosts()).length).toBe(before);
  });
});

describe.skipIf(!hasDb)("onboarding answers", () => {
  it("saves her topics and posts a week, and Plan this week follows them", async () => {
    const { instagramQuestions, loadInstagramPrefs, saveInstagramPrefs, DEFAULT_PREFS } = await import("../lib/instagram/onboarding");
    await expect(instagramQuestions.save({ topics: ["how_to_book", "nope"] })).rejects.toThrow(/from the list/);
    await expect(instagramQuestions.save({ topics: [] })).rejects.toThrow(/at least one/);
    await instagramQuestions.save({ topics: ["how_to_book", "fees_superbills", "first_session"], posts_per_week: "3" });
    expect(await instagramQuestions.load()).toEqual({ topics: ["how_to_book", "fees_superbills", "first_session"], posts_per_week: "3" });

    const { chat } = stubModels();
    const r = await planWeek("test", { chat, graphic });
    expect(r.saved).toHaveLength(3);
    const week = await listPosts({ week: r.week });
    expect(new Set(week.slice(0, 3).map((p) => p.pillar))).toEqual(new Set(["first_session", "fees_superbills", "how_to_book"]));

    await saveInstagramPrefs(DEFAULT_PREFS);
    expect(await loadInstagramPrefs()).toEqual(DEFAULT_PREFS);
  });
});
