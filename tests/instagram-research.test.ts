// Research first: three small web searches at once, then 2-3 angles with their
// links. Every model and search call is stubbed (no network).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "../lib/db";
import type { GroundedAnswer } from "../lib/meta";
import type { ChatFn } from "../lib/instagram/critic";
import { checkAngles, research, researchTopic, usableLink, type SearchFn } from "../lib/instagram/research";
import { listPosts, requestPost, researchPost } from "../lib/instagram/store";

const hasDb = Boolean(process.env.DATABASE_URL);

function stubSearch(opts: { fail?: boolean } = {}) {
  const calls: string[] = [];
  const search: SearchFn = async (feature) => {
    calls.push(feature);
    if (opts.fail) throw new Error("search down");
    const kind = feature.split(".").at(-1);
    return {
      text: `Notes about ${kind}.`,
      searched: true,
      sources: [
        { url: `https://www.example.org/${kind}`, title: `Guide to ${kind}`, snippet: "" },
        { url: `https://www.instagram.com/p/abc${kind}/`, title: "An Instagram post", snippet: "" },
        { url: "https://www.facebook.com/somepage", title: "A Facebook page", snippet: "" },
      ],
      citations: [],
      tokens: 10,
    } satisfies GroundedAnswer;
  };
  return { search, calls };
}

function stubChat(angles: unknown[], summary = "Therapists keep these posts plain. Carousels that walk through steps do well.") {
  const seen: { feature: string; content: string }[] = [];
  const chat = (async (feature: string, params: { messages: { content: unknown }[] }) => {
    seen.push({ feature, content: String(params.messages.at(-1)?.content) });
    return { choices: [{ message: { content: JSON.stringify({ summary, angles }) } }] };
  }) as unknown as ChatFn;
  return { chat, seen };
}

const good = [
  { title: "What a first session for anxiety looks like", hook: "Curious what happens first?", format: "carousel", why: "Step posts answer the first question.", pillar: "first_session", source_numbers: [1, 2] },
  { title: "What a session costs", hook: "Here's what it costs.", format: "single picture", why: "Plain prices help people book.", pillar: "fees_superbills", source_numbers: [3, 99] },
  { title: "Ways to cope with your anxiety", hook: "Try box breathing tonight.", format: "reel", why: "Tips get saves.", pillar: "first_session", source_numbers: [1] },
];

describe("links", () => {
  it("never uses Instagram, Facebook or Threads pages, or anything but http(s)", () => {
    expect(usableLink("https://www.instagram.com/p/x/")).toBe(false);
    expect(usableLink("https://scontent.cdninstagram.com/a.jpg")).toBe(false);
    expect(usableLink("https://m.facebook.com/x")).toBe(false);
    expect(usableLink("https://www.threads.net/@x")).toBe(false);
    expect(usableLink("javascript:alert(1)")).toBe(false);
    expect(usableLink("https://www.psychologytoday.com/us/blog/x")).toBe(true);
  });

  it("an angle keeps only numbers that point at a real source, and the advice angle is dropped", () => {
    const numbered = [
      { url: "https://a.example/1", title: "1" },
      { url: "https://b.example/2", title: "2" },
      { url: "https://c.example/3", title: "3" },
    ];
    const out = checkAngles(good as never, numbered);
    expect(out.map((a) => a.title)).toEqual(["What a first session for anxiety looks like", "What a session costs"]);
    expect(out[0].sources).toEqual(["https://a.example/1", "https://b.example/2"]);
    expect(out[1].sources).toEqual(["https://c.example/3"]);
  });
});

describe("researchTopic", () => {
  it("runs the three helpers at once and hands the writer only usable links", async () => {
    const { search, calls } = stubSearch();
    const { chat, seen } = stubChat(good);
    const r = await researchTopic("anxiety first session", { search, chat });
    expect(calls.sort()).toEqual(["instagram.research.formats", "instagram.research.hooks", "instagram.research.posts"]);
    expect(seen[0].feature).toBe("instagram.research.angles");
    expect(seen[0].content).not.toMatch(/instagram\.com|facebook\.com/);
    expect(r.source).toBe("web");
    expect(r.angles).toHaveLength(2);
    for (const a of r.angles) for (const u of a.sources) expect(usableLink(u)).toBe(true);
    expect(r.sources.every((s) => r.angles.some((a) => a.sources.includes(s.url)))).toBe(true);
  });

  it("refuses a summary that gives advice", async () => {
    const { search } = stubSearch();
    const { chat } = stubChat(good, "Try box breathing to calm your anxiety.");
    await expect(researchTopic("anxiety", { search, chat })).rejects.toThrow(/two safe angles/);
  });
});

describe.skipIf(!hasDb)("saved research", () => {
  beforeAll(async () => {
    await db()`delete from practice_os.post_research`;
  });
  afterAll(async () => {
    await closeDb();
  });

  it("falls back to plain angles when the search is down, and says so", async () => {
    const { search } = stubSearch({ fail: true });
    const r = await research("a brand new topic about parking", { search });
    expect(r.source).toBe("fixed");
    expect(r.angles.length).toBeGreaterThanOrEqual(2);
    expect(r.summary).toMatch(/couldn't search the web/);
  });

  it("reuses this week's research for the same topic instead of searching again", async () => {
    const first = stubSearch();
    const a = await research("Superbills for out-of-network", { search: first.search, chat: stubChat(good).chat });
    const second = stubSearch();
    const b = await research("superbills for OUT-of-network ", { search: second.search, chat: stubChat(good).chat });
    expect(b.id).toBe(a.id);
    expect(second.calls).toEqual([]);
  });

  it("an advice topic is refused before any search, with the logistics angle", async () => {
    const { search, calls } = stubSearch();
    const r = await researchPost("how to work through anxiety", { search, chat: stubChat(good).chat });
    expect(r).toMatchObject({ outcome: "off_topic", angle: { label: "What a first session for anxiety looks like" } });
    expect(calls).toEqual([]);
  });

  it("a post written from an angle points back at its research", async () => {
    const r = await research("Superbills for out-of-network", { search: stubSearch().search, chat: stubChat(good).chat });
    const chat = (async (feature: string) => {
      const reply = (o: unknown) => ({ choices: [{ message: { content: JSON.stringify(o) } }] });
      if (feature === "instagram.write") return reply({ posts: [{ pillar: "fees_superbills", headline: "What a session costs", body: "We give you a superbill for your insurance.", alt_text: "A calm desk" }] });
      if (feature === "instagram.critic") return reply({ breaks: [] });
      return reply({ ok: true, problems: [] });
    }) as unknown as ChatFn;
    process.env.PLAYWRIGHT_IMAGE_STANDIN = "1";
    try {
      const out = await requestPost("test", "What a session costs", "fees_superbills", { chat, researchId: r.id! });
      expect("post" in out).toBe(true);
      const [row] = await db()<{ research_id: string }[]>`select research_id from practice_os.posts where id = ${"post" in out ? out.post.id : null}`;
      expect(row.research_id).toBe(r.id);
      expect((await listPosts()).length).toBeGreaterThan(0);
    } finally {
      delete process.env.PLAYWRIGHT_IMAGE_STANDIN;
    }
  });
});
