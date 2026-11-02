// Chat edits revise the post that's waiting instead of piling up approvals, and
// "make a reel about X" in chat goes to the studio. Against the throwaway local
// Postgres; every model call is a fixture, and the client-detail guard is stubbed
// (it has its own tests) so no name-finder model is needed.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("../lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: vi.fn(async (t: string) => ({ ok: true, text: t })) }));
const makeProject = vi.hoisted(() => vi.fn());
vi.mock("../lib/studio/store", async (orig) => ({ ...(await orig<typeof import("../lib/studio/store")>()), makeProject }));

import { queueApproval } from "../lib/approvals";
import { runTool, TOOLS_BY_NAME } from "../lib/aeon/tools";
import { closeDb, db } from "../lib/db";
import type { ChatFn } from "../lib/instagram/critic";
import { revisePost } from "../lib/instagram/revise";
import { practiceFacts } from "../lib/instagram/store";

const hasDb = Boolean(process.env.DATABASE_URL);
const made: string[] = [];

/** Muse by feature: the writer returns `body`, the critic finds nothing. */
function stub(body: string, headline = "How booking works") {
  return (async (feature: string) => {
    const reply = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
    if (feature === "instagram.write") return reply({ posts: [{ pillar: "how_to_book", headline, body, alt_text: "A calm booking page" }] });
    if (feature === "instagram.critic") return reply({ breaks: [] });
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

const pending = async () => Number((await db()`select count(*) as n from practice_os.approvals where kind = 'instagram_post' and status = 'pending'`)[0].n);

beforeAll(() => {
  process.env.DRY_RUN = "true";
});

afterAll(async () => {
  if (!hasDb) return;
  if (made.length) {
    const ids = await db()<{ approval_id: string | null }[]>`select approval_id from practice_os.posts where id = any(${made}::uuid[])`;
    await db()`delete from practice_os.posts where id = any(${made}::uuid[])`;
    const a = ids.map((x) => x.approval_id).filter((x): x is string => Boolean(x));
    if (a.length) await db()`delete from practice_os.approvals where id = any(${a}::uuid[])`;
  }
  await closeDb();
});

describe.skipIf(!hasDb)("a chat edit revises the waiting post", () => {
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

describe.skipIf(!hasDb)("chat routing to the studio", () => {
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
