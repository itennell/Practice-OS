// Chat edits revise the post that's waiting instead of piling up approvals, and
// "make a reel about X" in chat goes to the studio. Against the throwaway local
// Postgres; every model call is a fixture, and the client-detail guard is stubbed
// (it has its own tests) so no name-finder model is needed.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { REFERRALS_ONLY_DEMO } from "../lib/features";
vi.mock("../lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: vi.fn(async (t: string) => ({ ok: true, text: t })) }));
const makeProject = vi.hoisted(() => vi.fn());
vi.mock("../lib/studio/store", async (orig) => ({ ...(await orig<typeof import("../lib/studio/store")>()), makeProject }));

import sharp from "sharp";
import { queueApproval } from "../lib/approvals";
import { CAP_REACHED, STUDIO_DAILY_CAP } from "../lib/aeon/tools-media";
import { emptyDoc } from "../lib/studio/doc";
import { runTool, TOOLS_BY_NAME } from "../lib/aeon/tools";
import { closeDb, db } from "../lib/db";
import type { ChatFn } from "../lib/instagram/critic";
import { revisePost } from "../lib/instagram/revise";
import { practiceFacts } from "../lib/instagram/store";

const hasDb = Boolean(process.env.DATABASE_URL);
const made: string[] = [];

/** Muse by feature: the writer returns `body`, the critic finds nothing. */
function stub(body: string, headline = "How booking works", extra: { pictureOk?: boolean; edit?: unknown } = {}) {
  return (async (feature: string) => {
    const reply = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
    if (feature === "instagram.write") return reply({ posts: [{ pillar: "how_to_book", headline, body, alt_text: "A calm booking page" }] });
    if (feature === "instagram.critic") return reply({ breaks: [] });
    if (feature === "instagram.graphic_check") return reply(extra.pictureOk === false ? { ok: false, problems: ["The words are hard to read."] } : { ok: true, problems: [] });
    if (feature === "studio.edit") return reply(extra.edit);
    throw new Error(`unexpected model call ${feature}`);
  }) as unknown as ChatFn;
}

async function waitingPost(): Promise<{ postId: string; approvalId: string }> {
  const f = await practiceFacts();
  const caption = `Pick a time on my booking page. A first session is $200, and I see people on Tuesdays.\n\n${f.licenseLine}`;
  const [p] = await db()<{ id: string }[]>`
    insert into practice_os.posts (topic, caption, headline, alt_text, status, week_of)
    values ('how_to_book', ${caption}, 'How booking works', 'A calm booking page', 'pending_approval', current_date) returning id`;
  const approvalId = await queueApproval({ kind: "instagram_post", title: "Instagram post: How booking works", preview: { body: caption, headline: "How booking works" }, payload: { post_id: p.id }, createdBy: "test" });
  await db()`update practice_os.posts set approval_id = ${approvalId} where id = ${p.id}`;
  made.push(p.id);
  return { postId: p.id, approvalId };
}

const graphic = {
  cutout: async () => null,
  background: () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#EDE7F6" } }).png().toBuffer(),
};
const projects: string[] = [];

const pending = async () => Number((await db()`select count(*) as n from practice_os.approvals where kind = 'instagram_post' and status = 'pending'`)[0].n);

beforeAll(() => {
  process.env.DRY_RUN = "true";
});

afterAll(async () => {
  if (!hasDb) return;
  if (projects.length) await db()`delete from practice_os.studio_projects where id = any(${projects}::uuid[])`;
  if (made.length) {
    const ids = await db()<{ approval_id: string | null }[]>`select approval_id from practice_os.posts where id = any(${made}::uuid[])`;
    await db()`delete from practice_os.posts where id = any(${made}::uuid[])`;
    const a = ids.map((x) => x.approval_id).filter((x): x is string => Boolean(x));
    if (a.length) await db()`delete from practice_os.approvals where id = any(${a}::uuid[])`;
  }
  await closeDb();
});

describe.skipIf(REFERRALS_ONLY_DEMO || !hasDb)("a chat edit revises the waiting post", () => {
  it("'change it to Wednesday' updates the same post and approval; no second approval", async () => {
    const { postId, approvalId } = await waitingPost();
    const before = await pending();
    const f = await practiceFacts();
    const r = await revisePost("test", "change it to Wednesday", { postId, chat: stub("Pick a time on my booking page. A first session is $200, and I see people on Wednesdays.") });
    expect(r).toMatchObject({ outcome: "revised", postId, approvalId, via: "post" });
    expect(await pending()).toBe(before);
    const [post] = await db()<{ caption: string }[]>`select caption from practice_os.posts where id = ${postId}`;
    expect(post.caption).toBe(`Pick a time on my booking page. A first session is $200, and I see people on Wednesdays.\n\n${f.licenseLine}`);
    const [a] = await db()<{ status: string; preview: { body: string } }[]>`select status, preview from practice_os.approvals where id = ${approvalId}`;
    expect(a.status).toBe("pending");
    expect(a.preview.body).toBe(post.caption);
  });

  it("a change to a fee she doesn't charge is refused and the post stays as it was", async () => {
    const { postId } = await waitingPost();
    const r = await revisePost("test", "say it's $95", { postId, chat: stub("A first session is $95.") });
    expect(r.outcome).toBe("refused");
    const [post] = await db()<{ caption: string }[]>`select caption from practice_os.posts where id = ${postId}`;
    expect(post.caption).toContain("$200");
  });

  it("draft_instagram_post with an edit revises the newest waiting post instead of queueing another", async () => {
    const { approvalId } = await waitingPost();
    const before = await pending();
    const res = await runTool("draft_instagram_post", { request: "make it shorter" }, { by: "test", chat: stub("Pick a time on my booking page.") });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ revised_existing: true, approval_id: approvalId });
    expect(await pending()).toBe(before);
  });
});

describe.skipIf(REFERRALS_ONLY_DEMO || !hasDb)("revising never half-changes or touches the wrong post", () => {
  it("a post that's no longer pending is never changed", async () => {
    const { postId, approvalId } = await waitingPost();
    await db()`update practice_os.approvals set status = 'rejected', decided_at = now() where id = ${approvalId}`;
    const r = await revisePost("test", "make it shorter", { postId, chat: stub("Shorter.") });
    expect(r).toEqual({ outcome: "not_pending", why: "That post isn't waiting for your approval any more, so it can't change here. Ask me for a new one." });
    const [post] = await db()<{ caption: string }[]>`select caption from practice_os.posts where id = ${postId}`;
    expect(post.caption).toContain("Tuesdays");
  });

  it("a new headline whose picture fails its check changes nothing", async () => {
    const { postId, approvalId } = await waitingPost();
    const r = await revisePost("test", "change the headline to Book in two steps", { postId, chat: stub("Pick a time on my booking page.", "Book in two steps", { pictureOk: false }), graphic });
    expect(r).toEqual({ outcome: "refused", why: "The new picture didn't pass its check, so nothing changed. The post waiting for you is as it was." });
    const [post] = await db()<{ caption: string; headline: string }[]>`select caption, headline from practice_os.posts where id = ${postId}`;
    expect(post.headline).toBe("How booking works");
    expect(post.caption).toContain("Tuesdays");
    const [a] = await db()<{ title: string }[]>`select title from practice_os.approvals where id = ${approvalId}`;
    expect(a.title).toBe("Instagram post: How booking works");
  });

  it("an advice change is refused by the topic gate before any model call", async () => {
    const { postId } = await waitingPost();
    const never = (() => {
      throw new Error("no model call");
    }) as unknown as ChatFn;
    const r = await revisePost("test", "change it to tips to cope with anxiety", { postId, chat: never });
    expect(r.outcome).toBe("refused");
  });

  it("a studio edit that changes nothing is not a revision", async () => {
    const { postId } = await waitingPost();
    const doc = { ...emptyDoc("post", "booking"), title: "How booking works", caption: "c", slides: [{ id: "s1", kind: "picture" as const, text: "", seconds: 3 }] };
    const [p] = await db()<{ id: string }[]>`insert into practice_os.studio_projects (post_id, doc, base_doc) values (${postId}, ${db().json(doc as never)}, ${db().json(doc as never)}) returning id`;
    projects.push(p.id);
    const r = await revisePost("test", "make it better", { postId, chat: stub("", "", { edit: { reply: "Which part should change?", ops: [] } }) });
    expect(r).toEqual({ outcome: "unchanged", why: "Which part should change?" });
    const res = await runTool("revise_instagram_post", { change: "make it better", post_id: postId }, { by: "test", chat: stub("", "", { edit: { reply: "Which part should change?", ops: [] } }) });
    expect(JSON.parse(res.content[0].text)).toEqual({ revised: false, why: "Which part should change?" });
  });

  it("'Drop-in hours on Fridays' is a new post, not an edit of the waiting one", async () => {
    process.env.PLAYWRIGHT_IMAGE_STANDIN = "1";
    try {
      const { postId } = await waitingPost();
      const before = await pending();
      const res = await runTool("draft_instagram_post", { request: "Drop-in hours on Fridays" }, { by: "test", chat: stub("I keep drop-in hours on Fridays. Pick a time on my booking page.", "Drop-in hours on Fridays") });
      const out = JSON.parse(res.content[0].text);
      expect(out.revised_existing).toBeUndefined();
      expect(out.written).toBe(true);
      if (out.approval_id) {
        const [p] = await db()<{ id: string }[]>`select id from practice_os.posts where approval_id = ${out.approval_id}`;
        if (p) made.push(p.id);
      }
      expect(await pending()).toBe(before + 1);
      const [post] = await db()<{ caption: string }[]>`select caption from practice_os.posts where id = ${postId}`;
      expect(post.caption).toContain("Tuesdays");
    } finally {
      delete process.env.PLAYWRIGHT_IMAGE_STANDIN;
    }
  });
});

describe.skipIf(REFERRALS_ONLY_DEMO || !hasDb)("chat routing to the studio", () => {
  it("stops at the daily cap with a plain message", async () => {
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.studio_projects where created_at >= date_trunc('day', now())`;
    const doc = emptyDoc("post", "cap");
    for (let i = n; i < STUDIO_DAILY_CAP; i++) {
      const [p] = await db()<{ id: string }[]>`insert into practice_os.studio_projects (doc, base_doc) values (${db().json(doc as never)}, ${db().json(doc as never)}) returning id`;
      projects.push(p.id);
    }
    makeProject.mockClear();
    const res = await runTool("make_studio_post", { request: "how booking works", kind: "reel" }, { by: "test" });
    expect(JSON.parse(res.content[0].text)).toEqual({ made: false, why: CAP_REACHED });
    expect(makeProject).not.toHaveBeenCalled();
    await db()`delete from practice_os.studio_projects where id = any(${projects.splice(0)}::uuid[])`;
  });

  it("'make a reel about how booking works' makes a studio project and links to it", async () => {
    makeProject.mockImplementation(async (_by: string, request: string, emit: (e: unknown) => void) => {
      emit({ type: "research", summary: "Therapists post short how-to reels.", angles: [], source: "web", picked: 0 });
      return { id: "p1", approvalId: "a1", doc: { kind: "reel", title: "How booking works", caption: "c", slides: [{ id: "s1", kind: "picture", text: "" }, { id: "s2", kind: "point", text: "Pick a time" }] }, request };
    });
    expect(TOOLS_BY_NAME.get("make_studio_post")!.description).toMatch(/CAN make reels and carousels/);
    const res = await runTool("make_studio_post", { request: "how booking works", kind: "reel" }, { by: "test" });
    expect(makeProject.mock.calls[0][1]).toBe("Make a reel about how booking works");
    expect(JSON.parse(res.content[0].text)).toMatchObject({ made: true, kind: "reel", title: "How booking works", open: "/media/instagram", what_therapists_post: "Therapists post short how-to reels." });
  });

  it("an advice topic comes back with logistics angles, nothing made", async () => {
    makeProject.mockImplementation(async (_by: string, _r: string, emit: (e: unknown) => void) => {
      emit({ type: "redirect", why: "Posts stay on how your practice works.", angles: [{ label: "What a first session is like", pillar: "first_session" }] });
      return null;
    });
    const res = await runTool("make_studio_post", { request: "a reel on coping with anxiety" }, { by: "test" });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ made: false, offer_instead: ["What a first session is like"] });
  });
});
