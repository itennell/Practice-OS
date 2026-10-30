// Plan a week and ask for one post, end to end against a throwaway local
// Postgres, with every model call stubbed (no network). Checkpoint case:
// "a client of mine who…" is never written as asked.
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "../lib/db";
import type { ChatFn } from "../lib/instagram/critic";
import { PILLARS } from "../lib/instagram/pillars";
import { REFUSAL } from "../lib/aeon/guard";
import { listPosts, planSeveral, planWeek, practiceFacts, requestPost } from "../lib/instagram/store";
import { CRISIS_REPLY } from "../lib/safety";

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

/** What Muse tends to add on its own to a post about an illness (safe-messaging habit). */
const CRISIS_LINE = " If you're in crisis, call or text 988, the Suicide & Crisis Lifeline.";

/**
 * Answers by feature, like the real models would. `firstWrite` lets one test feed a bad first draft;
 * `crisisLineFirst` makes the first write add a 988 crisis line to every post, as Muse does for depression.
 */
function stubModels(opts: { firstWrite?: { pillar: string; headline: string; body: string }; crisisLineFirst?: boolean } = {}) {
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
      const extra = opts.crisisLineFirst && writes === 1 ? CRISIS_LINE : "";
      return reply({
        posts: ids.map((id) => ({ pillar: id, ...logistics[id], body: logistics[id].body.replace("FEE", FEE) + extra, alt_text: "Dana smiling beside the headline" })),
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

  it("never writes 'a client of mine who…'; it says why and offers a logistics angle, with nothing written", async () => {
    const { chat, seen } = stubModels();
    const before = (await listPosts()).length;
    const r = await requestPost("test", "Make a post about a client of mine who finally got her life back", null, { chat, graphic });
    expect(r).toMatchObject({ outcome: "off_topic", angle: { pillar: "first_session" } });
    expect(r.outcome === "off_topic" && r.why).toMatch(/client's story/);
    expect(seen).toEqual([]);
    expect((await listPosts()).length).toBe(before);
  });

  it("an advice topic gets the plain reason and the nearest logistics angle, never a silent swap", async () => {
    const { chat, seen } = stubModels();
    const r = await requestPost("test", "how to work through anxiety", null, { chat, graphic });
    expect(r).toEqual({
      outcome: "off_topic",
      why: "Posts stay on how your practice works, so Aeon can't write advice about anxiety.",
      angle: { label: "What a first session for anxiety looks like", pillar: "first_session" },
      angles: [
        { label: "What a first session for anxiety looks like", pillar: "first_session" },
        { label: "What sessions for anxiety cost", pillar: "fees_superbills" },
        { label: "How to book a first session for anxiety", pillar: "how_to_book" },
      ],
    });
    expect(seen).toEqual([]);
    // Picking the offered angle writes it.
    const ok = await requestPost("test", "What a first session for anxiety looks like", "first_session", { chat, graphic });
    expect(ok.outcome).toBe("queued");
  });

  it("a client name in the box is refused by the PHI guard before any model call", async () => {
    const { chat, seen } = stubModels();
    const before = (await listPosts()).length;
    const r = await requestPost("test", "a post about how Kevin Ortiz did at his first session", null, { chat, graphic });
    expect(r).toEqual({ outcome: "blocked", why: REFUSAL.client_name });
    const several = await planSeveral("test", "posts about Kevin Ortiz and his fees", 2, { chat, graphic });
    expect(several).toMatchObject({ outcome: "blocked" });
    expect(seen).toEqual([]);
    expect((await listPosts()).length).toBe(before);
    const [a] = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.audit_log where action = 'phi_refused' and subject_type = 'post'`;
    expect(a.n).toBeGreaterThanOrEqual(2);
  });

  it("plans several: 3 posts on her topic, each waiting for approval", async () => {
    const { chat } = stubModels();
    const r = await planSeveral("test", "superbills and out-of-network costs", 3, { chat, graphic });
    expect(r.outcome).toBe("planned");
    if (r.outcome !== "planned") throw new Error("unreachable");
    expect(r.saved).toHaveLength(3);
    expect(r.saved.every((s) => s.status === "pending_approval" && s.approvalId)).toBe(true);
    const off = await planSeveral("test", "tips for coping with grief", 2, { chat, graphic });
    expect(off).toMatchObject({ outcome: "off_topic", angle: { label: "What a first session for grief looks like" } });
  });

  // Review (PR #102): a self-harm hit on Muse's own draft answers with the fixed crisis text, never a reworded message.
  it("a draft where Muse adds a 988 crisis line is held back with the fixed crisis reply, not rewritten", async () => {
    const { chat, seen } = stubModels({ crisisLineFirst: true });
    const before = (await listPosts()).length;
    const one = await requestPost("test", "What a first session for depression looks like", "first_session", { chat, graphic });
    expect(one).toEqual({ outcome: "blocked", why: CRISIS_REPLY });
    expect(seen.filter((f) => f === "instagram.write")).toHaveLength(1);

    const { chat: chat2 } = stubModels({ crisisLineFirst: true });
    const several = await planSeveral("test", "what therapy for depression costs and how to book", 2, { chat: chat2, graphic });
    expect(several).toEqual({ outcome: "blocked", why: CRISIS_REPLY });
    expect((await listPosts()).length).toBe(before);
  });

  it("an illness topic gets a plain reason and three logistics angles, with nothing written", async () => {
    for (const ask of ["a post about depression", "depression", "how to cope with depression"]) {
      const { chat, seen } = stubModels();
      const r = await requestPost("test", ask, null, { chat, graphic });
      expect(r.outcome).toBe("off_topic");
      if (r.outcome !== "off_topic") throw new Error("unreachable");
      expect(r.why).toMatch(/^Posts stay on how your practice works/);
      expect(r.angles.map((a) => a.pillar)).toEqual(["first_session", "fees_superbills", "how_to_book"]);
      expect(r.angles[0].label).toBe("What a first session for depression looks like");
      expect(seen).toEqual([]);
      const plan = await planSeveral("test", ask, 3, { chat, graphic });
      expect(plan).toMatchObject({ outcome: "off_topic" });
    }
  });

  it("plans one post, or five", async () => {
    const { chat } = stubModels();
    const one = await planSeveral("test", "how superbills work", 1, { chat, graphic });
    expect(one.outcome === "planned" && one.saved).toHaveLength(1);
    const five = await planSeveral("test", "how superbills work", 5, { chat, graphic });
    expect(five.outcome === "planned" && five.saved).toHaveLength(5);
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
    expect(r.outcome === "blocked" && r.why).toBe(CRISIS_REPLY);
    expect(seen).toEqual([]);
    // Like chat: the crisis reply and the alert are both audited.
    const actions = (await db()<{ action: string }[]>`select action from practice_os.audit_log where action in ('crisis_reply', 'crisis_detected') and subject_type in ('post', 'media')`).map((x) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["crisis_reply", "crisis_detected"]));
    expect((await listPosts()).length).toBe(before);
  });
});

describe.skipIf(!hasDb)("onboarding answers", () => {
  it("saves her topics and posts a week, and Plan this week follows them", async () => {
    const { instagramQuestions, loadInstagramPrefs, saveInstagramPrefs, DEFAULT_PREFS } = await import("../lib/instagram/onboarding");
    await expect(instagramQuestions.save({ topics: ["how_to_book", "nope"] })).rejects.toThrow(/from the list/);
    await expect(instagramQuestions.save({ topics: [] })).rejects.toThrow(/at least one/);
    await instagramQuestions.save({ topics: ["how_to_book", "fees_superbills", "first_session"], posts_per_week: "3" });
    expect(await instagramQuestions.load()).toMatchObject({ topics: ["how_to_book", "fees_superbills", "first_session"], posts_per_week: "3" });

    const { chat } = stubModels();
    const r = await planWeek("test", { chat, graphic });
    expect(r.saved).toHaveLength(3);
    const week = await listPosts({ week: r.week });
    expect(new Set(week.slice(0, 3).map((p) => p.pillar))).toEqual(new Set(["first_session", "fees_superbills", "how_to_book"]));

    await saveInstagramPrefs(DEFAULT_PREFS);
    expect(await loadInstagramPrefs()).toEqual(DEFAULT_PREFS);
  });
});

describe.skipIf(!hasDb)("onboarding saves one question at a time", () => {
  it("keeps the topics when only the posts-a-week answer arrives", async () => {
    const { instagramQuestions, loadInstagramPrefs, saveInstagramPrefs, DEFAULT_PREFS } = await import("../lib/instagram/onboarding");
    await instagramQuestions.save({ topics: ["how_to_book"] });
    await instagramQuestions.save({ posts_per_week: "1" });
    expect(await loadInstagramPrefs()).toMatchObject({ topics: ["how_to_book"], postsPerWeek: 1 });
    await saveInstagramPrefs(DEFAULT_PREFS);
  });
});

describe.skipIf(!hasDb)("a draft after the marketing interview", () => {
  it("uses her picked style, topics and never-show list, and Aeon remembers them", async () => {
    const { instagramQuestions, instagramDeclined, saveInstagramPrefs, DEFAULT_PREFS } = await import("../lib/instagram/onboarding");
    // Her answers, one screen at a time, as onboarding sends them.
    for (const a of [
      { account: "has" },
      { goals: ["fill_spots", "explain_fees"] },
      { topics: ["how_to_book", "fees_superbills"] },
      { posts_per_week: "3" },
      { never_show: ["face", "office"] },
      { style: { pick: "plain", example: "Book online any time. Evenings open." } },
    ])
      await instagramQuestions.save(a);

    const systems: string[] = [];
    const { chat: base } = stubModels();
    const rewrites: string[] = [];
    const chat = (async (feature: string, params: { messages: { role: string; content: unknown }[] }) => {
      const res = await (base as unknown as (f: string, p: unknown) => Promise<{ choices: { message: { content: string } }[] }>)(feature, params);
      if (feature !== "instagram.write") return res;
      systems.push(String(params.messages[0].content));
      const ask = String(params.messages.at(-1)?.content);
      if (!ask.startsWith("Rewrite")) return res; // the first drafts describe her photo ("Dana smiling")
      rewrites.push(ask);
      const out = JSON.parse(res.choices[0].message.content) as { posts: Record<string, string>[] };
      out.posts = out.posts.map((p) => ({ ...p, alt_text: "A calendar page and a folder, softly lit, with the headline." }));
      return { choices: [{ message: { content: JSON.stringify(out) } }] };
    }) as unknown as ChatFn;
    let cutoutCalls = 0;
    const prompts: string[] = [];
    const r = await planWeek("test", {
      chat,
      graphic: {
        cutout: async () => {
          cutoutCalls++;
          return null;
        },
        background: async (prompt: string) => {
          prompts.push(prompt);
          return graphic.background();
        },
      },
    });

    // Only her two topics, each in her plain style, with her goals and limits.
    const week = await listPosts({ week: r.week });
    expect(new Set(week.slice(0, r.saved.length).map((p) => p.pillar))).toEqual(new Set(["how_to_book", "fees_superbills"]));
    expect(systems[0]).toMatch(/Voice: plain and direct/);
    expect(systems[0]).not.toMatch(/warm and welcoming/);
    expect(systems[0]).toContain("Book online any time.");
    expect(systems[0]).toMatch(/help with: Fill my open spots; Explain my fees and insurance/);
    expect(systems[0]).toMatch(/Never show, describe or mention: her face or photo, her office/);
    // "My face": her photo is never cut out or placed; "My office": no office in the picture.
    expect(cutoutCalls).toBe(0);
    // Plain code caught "Dana smiling" in the picture's description; each post was rewritten once without it.
    expect(rewrites.length).toBe(r.saved.length);
    expect(rewrites[0]).toMatch(/never show/);
    expect(week.slice(0, r.saved.length).every((p) => !/Dana/.test(p.altText ?? ""))).toBe(true);
    expect(prompts[0]).toMatch(/No office rooms/);

    const texts = (await db()<{ text: string }[]>`select text from practice_os.memories where not archived and topic = 'marketing'`).map((m) => m.text);
    expect(texts).toEqual(expect.arrayContaining(["Instagram post style: plain.", "Instagram posts never show: my face, my office."]));
    const [s1] = await db()<{ on: boolean }[]>`select (helpers_enabled ->> 'instagram')::boolean as on from practice_os.settings limit 1`;
    expect(s1.on).toBe(true);

    // Changing her mind to "Not for me" turns the helper off and replaces the memory.
    await instagramQuestions.save({ account: "no" });
    expect(await instagramDeclined()).toBe(true);
    const [s2] = await db()<{ on: boolean }[]>`select (helpers_enabled ->> 'instagram')::boolean as on from practice_os.settings limit 1`;
    expect(s2.on).toBe(false);
    const ig = (await db()<{ text: string }[]>`select text from practice_os.memories where not archived and text like 'Instagram:%'`).map((m) => m.text);
    expect(ig).toEqual(["Instagram: Doesn't want Instagram for the practice. Never suggest Instagram or posts."]);

    await saveInstagramPrefs(DEFAULT_PREFS);
    await db()`delete from practice_os.memories where source = 'onboarding' and topic = 'marketing'`;
    await db()`update practice_os.settings set helpers_enabled = helpers_enabled || '{"instagram": true}'::jsonb`;
  }, 180_000); // each memory passes the local client-detail guard
});

describe.skipIf(!hasDb)("after 'Not for me'", () => {
  it("nothing about Instagram runs, lists or counts, her post answers are cleared, and switching branches starts clean", async () => {
    const { instagramQuestions, loadInstagramPrefs, saveInstagramPrefs, DEFAULT_PREFS } = await import("../lib/instagram/onboarding");
    const { listApprovals } = await import("../lib/approvals");
    const { loadMenuData } = await import("../lib/ui/menu");

    // "I'd like one", then "I'll do it later"; then "Yes, I have one": the old step answer doesn't carry over.
    await instagramQuestions.save({ account: "wants" });
    await instagramQuestions.save({ guide: "later" });
    expect((await loadInstagramPrefs()).setup).toBe("later");
    await instagramQuestions.save({ account: "has" });
    expect((await loadInstagramPrefs()).setup).toBeNull();

    await instagramQuestions.save({ goals: ["fill_spots"], topics: ["how_to_book"], posts_per_week: "1", never_show: ["face"], style: { pick: "warm", example: "Book a call." } });
    const pending = (await listApprovals()).filter((a) => a.kind === "instagram_post").length;
    expect(pending).toBeGreaterThan(0); // Dana's sample posts wait for her
    const before = (await loadMenuData()).counts.approvals;

    await instagramQuestions.save({ account: "no" });
    expect(await loadInstagramPrefs()).toEqual({ ...DEFAULT_PREFS, account: "no" });
    const live = (await db()<{ text: string }[]>`select text from practice_os.memories where not archived and topic = 'marketing'`).map((m) => m.text);
    expect(live.filter((t) => /^Instagram post|^Instagram posts/.test(t))).toEqual([]);

    const { chat, seen } = stubModels();
    const r = await planWeek("test", { chat, graphic });
    expect(r).toMatchObject({ saved: [], declined: true });
    expect(await requestPost("test", "a post about how to book", null, { chat, graphic })).toMatchObject({ outcome: "declined" });
    expect(seen).toEqual([]); // no model call at all
    expect((await listApprovals()).some((a) => a.kind === "instagram_post")).toBe(false);
    expect((await loadMenuData()).counts.approvals).toBe(before - pending);

    // Going Back to "Meet your team" with an old map that has Instagram on doesn't turn it back on.
    const { saveAnswers } = await import("../lib/onboarding/store");
    await saveAnswers({ "instagram:account": "no" });
    await saveAnswers({ team: { admin: true, referrals: true, instagram: true, front_desk: true } });
    const [s] = await db()<{ on: boolean }[]>`select (helpers_enabled ->> 'instagram')::boolean as on from practice_os.settings limit 1`;
    expect(s.on).toBe(false);

    await saveInstagramPrefs(DEFAULT_PREFS);
    await db()`
      update practice_os.clinician_profile
         set onboarding_answers = onboarding_answers #- '{progress,values,instagram:account}' #- '{progress,values,team}'`;
    await db()`delete from practice_os.memories where source = 'onboarding' and topic = 'marketing'`;
    await db()`update practice_os.settings set helpers_enabled = helpers_enabled || '{"instagram": true}'::jsonb`;
  }, 180_000);
});
