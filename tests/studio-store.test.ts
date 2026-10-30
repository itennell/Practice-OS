// The chat-first studio end to end against a throwaway local Postgres, every
// model call stubbed: make a reel, change it from chat and the canvas, Undo and
// Redo, and the safety rules (self-harm, advice topics) on every step.
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approve } from "../lib/approvals";
import { closeDb, db } from "../lib/db";
import { RULE_TEXT, type ChatFn } from "../lib/instagram/critic";
import type { SearchFn } from "../lib/instagram/research";
import { practiceFacts } from "../lib/instagram/store";
import { CRISIS_REPLY } from "../lib/safety";
import { applyEdit, chatEdit, getProject, goToStep, KEEP_STEPS, makeProject, moveCursor, REAPPROVE, type MakeEvent } from "../lib/studio/store";

const hasDb = Boolean(process.env.DATABASE_URL);

const search: SearchFn = async (feature) => ({
  text: "Therapists post plain how-it-works posts. Short reels show booking steps.",
  searched: true,
  sources: [{ url: `https://example.com/guide/${feature.split(".").at(-1)}`, title: "Guide", snippet: "" }],
  citations: [],
  tokens: 0,
});

/** Answers by feature. `edit` is what Muse proposes for a chat instruction. */
function stub(edit: unknown = { reply: "Slide 2 is shorter.", ops: [{ op: "shorten_slide", slide: 2, text: "Pick a time online" }] }) {
  const chat = (async (feature: string) => {
    const reply = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
    if (feature === "instagram.research.angles")
      return reply({
        summary: "Therapists keep these posts plain: what happens and how to book.",
        angles: [
          { title: "How booking works, step by step", hook: "Booking takes two steps.", format: "reel", why: "Short how-tos do well.", pillar: "how_to_book", source_numbers: [1] },
          { title: "What your first call is like", hook: "Here's what the free call is.", format: "carousel", why: "Answers a common question.", pillar: "first_session", source_numbers: [2] },
        ],
      });
    if (feature === "instagram.write")
      return reply({ posts: [{ pillar: "how_to_book", headline: "How booking works", body: "Pick a time that works for you on the booking page. We talk for 15 minutes first, free. Link in bio.", alt_text: "A calm booking page" }] });
    if (feature === "instagram.critic") return reply({ breaks: [] });
    if (feature === "instagram.graphic_check") return reply({ ok: true, problems: [] });
    if (feature === "instagram.reel") return reply({ points: ["Pick a time that works for you on the booking page", "We talk for 15 minutes first, free"], book: "Book a free call. Link in bio." });
    if (feature === "studio.edit") return reply(edit);
    throw new Error(`unexpected model call ${feature}`);
  }) as unknown as ChatFn;
  return { chat };
}

const graphic = {
  cutout: async () => null,
  background: () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#EDE7F6" } }).png().toBuffer(),
};

async function makeReel(request = "make a reel about how booking works") {
  const events: MakeEvent[] = [];
  const project = await makeProject("test", request, (e) => events.push(e), { chat: stub().chat, search, graphic });
  return { project, events };
}

beforeAll(async () => {
  if (!hasDb) return;
  process.env.DRY_RUN = "true";
  await practiceFacts();
});

afterAll(async () => {
  if (!hasDb) return;
  await db()`delete from practice_os.studio_projects`;
  await db()`delete from practice_os.posts where is_sample = false`;
  await closeDb();
});

describe.skipIf(!hasDb)("studio", () => {
  it("makes a reel, reporting each step as it goes", async () => {
    const { project, events } = await makeReel();
    expect(project).not.toBeNull();
    const types = events.map((e) => e.type);
    // Research arrives before the words, the words before the finished project.
    expect(types.indexOf("research")).toBeLessThan(types.indexOf("words"));
    expect(types.indexOf("words")).toBeLessThan(types.indexOf("project"));
    const done = events.filter((e): e is Extract<MakeEvent, { type: "step" }> => e.type === "step" && e.state === "done").map((e) => e.id);
    expect(done).toEqual(expect.arrayContaining(["posts", "hooks", "formats", "angles", "write", "picture", "slides"]));
    const doc = project!.doc;
    expect(doc.kind).toBe("reel");
    expect(doc.slides.map((s) => s.kind)).toEqual(["picture", "point", "point", "book"]);
    expect(project!.approvalStatus).toBe("pending");
    const [pic] = await db()`select count(*)::int as n from practice_os.studio_pictures where project_id = ${project!.id}`;
    expect(pic.n).toBe(1);
  });

  it("a chat edit changes the canvas; Undo puts it back exactly; Redo again", async () => {
    const { project } = await makeReel();
    const before = project!.doc;
    const r = await chatEdit(project!.id, "make slide 2 shorter", { by: "test", chat: stub().chat });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.doc.slides[1].text).toBe("Pick a time online");
    expect(r.project.steps).toHaveLength(1);
    expect(r.project.steps[0]).toMatchObject({ source: "chat", summary: "Shortened slide 2" });
    const undone = await moveCursor(project!.id, -1);
    expect(undone.ok && undone.project.doc).toEqual(before);
    expect(undone.ok && undone.project.canRedo).toBe(true);
    const redone = await moveCursor(project!.id, 1);
    expect(redone.ok && redone.project.doc.slides[1].text).toBe("Pick a time online");
    // The post she approves follows the studio.
    const [post] = await db()<{ reel: { slides: { text: string }[] } }[]>`select reel from practice_os.posts where id = ${project!.postId}`;
    expect(post.reel.slides[1].text).toBe("Pick a time online");
  });

  it("'undo' typed in chat undoes, and a new edit after Undo drops the old future", async () => {
    const { project } = await makeReel();
    const id = project!.id;
    await applyEdit(id, [{ op: "set_palette", palette: "warm" }], { source: "canvas", by: "test", expectCursor: 0 });
    const u = await chatEdit(id, "undo", { by: "test" });
    expect(u.ok && u.project.doc.palette).toBe("calm");
    await applyEdit(id, [{ op: "set_palette", palette: "cool" }], { source: "canvas", by: "test", expectCursor: 0 });
    const p = (await getProject(id))!;
    expect(p.doc.palette).toBe("cool");
    expect(p.canRedo).toBe(false);
    expect((await goToStep(id, 0)).ok).toBe(true);
    expect((await getProject(id))!.doc.palette).toBe("calm");
  });

  it("refuses a canvas change made on an old version (two tabs)", async () => {
    const { project } = await makeReel();
    await applyEdit(project!.id, [{ op: "set_palette", palette: "warm" }], { source: "canvas", by: "test", expectCursor: 0 });
    const stale = await applyEdit(project!.id, [{ op: "set_palette", palette: "cool" }], { source: "canvas", by: "test", expectCursor: 0 });
    expect(stale).toMatchObject({ ok: false, status: 409 });
  });

  it("never saves advice or self-harm words, from chat or the canvas", async () => {
    const { project } = await makeReel();
    const id = project!.id;
    const advice = await applyEdit(id, [{ op: "set_slide_text", slide: 2, text: "Tips to cope with anxiety at work" }], { source: "canvas", by: "test" });
    expect(advice).toMatchObject({ ok: false, status: 422 });
    const harm = await chatEdit(id, "add a slide about suicide", { by: "test", chat: stub().chat });
    expect(harm).toMatchObject({ ok: false, hardStop: true, why: CRISIS_REPLY });
    // Muse proposing self-harm words is stopped by plain code too.
    const sneaky = await chatEdit(id, "add a point", { by: "test", chat: stub({ reply: "Added.", ops: [{ op: "add_slide", after: 2, text: "If you want to kill yourself, book" }] }).chat });
    expect(sneaky).toMatchObject({ ok: false, hardStop: true, why: RULE_TEXT.self_harm });
    expect((await getProject(id))!.steps).toHaveLength(0);
  });

  it("an unclear instruction changes nothing and says so", async () => {
    const { project } = await makeReel();
    const r = await chatEdit(project!.id, "hmm", { by: "test", chat: stub({ reply: "Which slide should change?", ops: [] }).chat });
    expect(r).toMatchObject({ ok: true, reply: "Which slide should change?" });
    expect(r.ok && r.project.steps).toHaveLength(0);
  });

  it("an advice topic gets the plain reason and logistics angles, never an error", async () => {
    const events: MakeEvent[] = [];
    const project = await makeProject("test", "make a post about how to cope with depression", (e) => events.push(e), { chat: stub().chat, search, graphic });
    expect(project).toBeNull();
    const r = events.find((e) => e.type === "redirect") as Extract<MakeEvent, { type: "redirect" }>;
    expect(r.why).toMatch(/practice works/);
    expect(r.angles.length).toBeGreaterThanOrEqual(2);
    expect(r.angles[0].label).toMatch(/depression/);
    expect(events.some((e) => e.type === "stop")).toBe(false);
  });

  it("a video starts empty and never stores the file", async () => {
    const events: MakeEvent[] = [];
    const project = await makeProject("test", "edit my own video", (e) => events.push(e));
    expect(project!.doc.kind).toBe("video");
    const clip = { id: "c1", source: "opfs:abc", name: "tour.mp4", duration: 8, in: 0, out: 8 };
    const r = await applyEdit(project!.id, [{ op: "add_clip", clip }], { source: "canvas", by: "test" });
    expect(r.ok).toBe(true);
    const cut = await chatEdit(project!.id, "cut the first 3 seconds", { by: "test", chat: stub({ reply: "Cut.", ops: [{ op: "cut_start", seconds: 3 }] }).chat });
    expect(cut.ok && cut.project.doc.clips[0]).toMatchObject({ in: 3, out: 8 });
    // A clip from chat (data only the browser has) is refused.
    const fromChat = await chatEdit(project!.id, "add my clip", { by: "test", chat: stub({ reply: "Ok.", ops: [{ op: "add_clip", clip: { ...clip, id: "c9" } }] }).chat });
    expect(fromChat.ok).toBe(false);
  });
});

// ---- Review fixes (PR #103) ------------------------------------------------------------

const audits = async (action: string, since: Date) =>
  (await db()<{ n: number }[]>`select count(*)::int as n from practice_os.audit_log where action = ${action} and at >= ${since}`)[0].n;

/** Approves the project's post the way she would (DRY_RUN): the post becomes ready. */
async function approveIt(projectId: string) {
  const p = (await getProject(projectId))!;
  const r = await approve(p.approvalId!, { by: "test" });
  expect(r.ok).toBe(true);
  const after = (await getProject(projectId))!;
  expect(after.postStatus).toBe("ready");
  return after;
}

describe.skipIf(!hasDb)("studio review fixes", () => {
  it("an approved post is never changed silently: Aeon asks, and Continue queues a fresh approval", async () => {
    const { project } = await makeReel();
    const id = project!.id;
    const ready = await approveIt(id);
    const oldApproval = ready.approvalId!;

    // Canvas, chat, Undo and the version list all ask first and change nothing.
    const canvas = await applyEdit(id, [{ op: "set_slide_text", slide: 2, text: "Pick any time online" }], { source: "canvas", by: "test", expectCursor: 0 });
    expect(canvas).toMatchObject({ ok: false, status: 409, why: REAPPROVE, needsReapproval: true });
    const chat = await chatEdit(id, "make slide 2 shorter", { by: "test", chat: stub().chat });
    expect(chat).toMatchObject({ ok: false, needsReapproval: true });
    expect(await goToStep(id, 0)).toMatchObject({ ok: false, needsReapproval: true });
    const still = (await getProject(id))!;
    expect(still.doc).toEqual(ready.doc);
    expect(still.steps).toHaveLength(0);
    const [post] = await db()<{ status: string; reel: { slides: { text: string }[] } }[]>`select status, reel from practice_os.posts where id = ${ready.postId}`;
    expect(post.status).toBe("ready");

    // Continue: the change is saved, the post waits for her again, with a new approval.
    const go = await applyEdit(id, [{ op: "set_slide_text", slide: 2, text: "Pick any time online" }], { source: "canvas", by: "test", expectCursor: 0, reapprove: true, chat: stub().chat });
    expect(go.ok).toBe(true);
    if (!go.ok) return;
    expect(go.project.postStatus).toBe("pending_approval");
    expect(go.project.approvalStatus).toBe("pending");
    expect(go.project.approvalId).not.toBe(oldApproval);
    const [after] = await db()<{ reel: { slides: { text: string }[] } }[]>`select reel from practice_os.posts where id = ${ready.postId}`;
    expect(after.reel.slides[1].text).toBe("Pick any time online");
    const [old] = await db()<{ status: string }[]>`select status from practice_os.approvals where id = ${oldApproval}`;
    expect(old.status).toBe("done");
    // Now waiting again, a further edit needs no question.
    expect((await applyEdit(id, [{ op: "set_palette", palette: "warm" }], { source: "canvas", by: "test" })).ok).toBe(true);
  });

  it("a post that is being posted or already posted never changes, even with Continue", async () => {
    const { project } = await makeReel();
    await db()`update practice_os.posts set status = 'published' where id = ${project!.postId}`;
    const r = await applyEdit(project!.id, [{ op: "set_palette", palette: "warm" }], { source: "canvas", by: "test", reapprove: true });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.ok === false && r.needsReapproval).toBeFalsy();
    expect((await moveCursor(project!.id, 1, { reapprove: true })).ok).toBe(false);
  });

  it("a waiting post's approval preview follows the edit", async () => {
    const { project } = await makeReel();
    const r = await applyEdit(project!.id, [{ op: "set_caption", text: `New words about booking.\n\n${(await practiceFacts()).licenseLine}` }], { source: "canvas", by: "test", chat: stub().chat });
    expect(r.ok).toBe(true);
    const [a] = await db()<{ preview: { body: string } }[]>`select preview from practice_os.approvals where id = ${project!.approvalId}`;
    expect(a.preview.body).toMatch(/^New words about booking/);
  });

  it("a video's topic gets the crisis check (fixed reply, alert, audit) and the PHI guard before anything is saved", async () => {
    const since = new Date();
    const before = (await db()<{ n: number }[]>`select count(*)::int as n from practice_os.studio_projects`)[0].n;
    const events: MakeEvent[] = [];
    expect(await makeProject("test", "edit my own video about wanting to kill myself", (e) => events.push(e))).toBeNull();
    expect(events).toContainEqual({ type: "stop", why: CRISIS_REPLY });
    expect(await audits("crisis_reply", since)).toBeGreaterThanOrEqual(1);
    expect(await audits("crisis_detected", since)).toBeGreaterThanOrEqual(1);
    const phi: MakeEvent[] = [];
    expect(await makeProject("test", "edit my own video of my client Kevin Ortiz", (e) => phi.push(e))).toBeNull();
    expect(phi.some((e) => e.type === "stop")).toBe(true);
    expect((await db()<{ n: number }[]>`select count(*)::int as n from practice_os.studio_projects`)[0].n).toBe(before);
  });

  it("Aeon's own reel points get Muse's critic before they're saved", async () => {
    const base = stub().chat;
    const chat = (async (feature: string, params: { messages: { content: unknown }[] }) => {
      if (feature === "instagram.reel")
        return { choices: [{ message: { content: JSON.stringify({ points: ["Pick a time that works for you on the booking page", "We talk for 15 minutes first, free"], book: "Book a free call. Link in bio." }) } }] };
      // The critic passes the caption, and flags the slide run.
      if (feature === "instagram.critic" && String(params.messages.at(-1)?.content).includes("We talk for 15 minutes first, free\nBook a free call"))
        return { choices: [{ message: { content: JSON.stringify({ breaks: ["advice"] }) } }] };
      return base(feature, params as never);
    }) as unknown as ChatFn;
    const events: MakeEvent[] = [];
    const project = await makeProject("test", "make a reel about how booking works", (e) => events.push(e), { chat, search, graphic });
    expect(project).toBeNull();
    const stop = events.find((e) => e.type === "stop") as Extract<MakeEvent, { type: "stop" }>;
    expect(stop.why).toMatch(/safety check/);
  });

  it("a new picture: its idea is checked first, the step is saved first, and an old picture is never reused", async () => {
    const { project } = await makeReel();
    const id = project!.id;
    // Advice in the idea never reaches the image prompt.
    let drawn = 0;
    const counting = { ...graphic, background: () => (drawn++, graphic.background()) };
    const advice = await applyEdit(id, [{ op: "new_picture", idea: "ways to manage your anxiety" }], { source: "canvas", by: "test", graphic: counting, chat: stub().chat });
    expect(advice).toMatchObject({ ok: false, status: 422 });
    expect(drawn).toBe(0);

    const one = await applyEdit(id, [{ op: "new_picture", idea: "a sunny office" }], { source: "canvas", by: "test", graphic: counting, chat: stub().chat });
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const v1 = one.project.doc.picture;
    expect(v1).toBe(1);
    await moveCursor(id, -1);
    const two = await applyEdit(id, [{ op: "new_picture", idea: "a quiet waiting room" }], { source: "canvas", by: "test", graphic: counting, chat: stub().chat });
    expect(two.ok && two.project.doc.picture).toBeGreaterThan(v1);
    // The undone picture nothing points at any more is cleaned up.
    const versions = (await db()<{ version: number }[]>`select version from practice_os.studio_pictures where project_id = ${id} order by version`).map((r) => r.version);
    expect(versions).toEqual([0, two.ok ? two.project.doc.picture : -1]);

    // A picture that fails its check takes its step back; the old picture stays.
    const failing = (async (feature: string, params: never) =>
      feature === "instagram.graphic_check" ? { choices: [{ message: { content: JSON.stringify({ ok: false, problems: ["blurry"] }) } }] } : stub().chat(feature, params)) as unknown as ChatFn;
    const before = (await getProject(id))!;
    const bad = await applyEdit(id, [{ op: "new_picture", idea: "a desk" }], { source: "canvas", by: "test", graphic, chat: failing });
    expect(bad).toMatchObject({ ok: false, status: 502 });
    const after = (await getProject(id))!;
    expect(after.cursor).toBe(before.cursor);
    expect(after.doc).toEqual(before.doc);
  });

  it("keeps the last 50 steps, folding older ones into how it started", async () => {
    const { project } = await makeReel();
    const id = project!.id;
    const palettes = ["warm", "cool", "bright", "calm"] as const;
    for (let i = 0; i < KEEP_STEPS + 5; i++) {
      const r = await applyEdit(id, [{ op: "set_palette", palette: palettes[i % 4] }], { source: "canvas", by: "test" });
      expect(r.ok).toBe(true);
    }
    const p = (await getProject(id))!;
    expect(p.cursor).toBe(KEEP_STEPS);
    expect(p.steps).toHaveLength(KEEP_STEPS);
    expect(p.steps[0].seq).toBe(1);
    expect(p.doc.palette).toBe(palettes[(KEEP_STEPS + 4) % 4]);
    // Step 0 is now the state after the 5th change, not how Aeon first made it.
    const back = await goToStep(id, 0);
    expect(back.ok && back.project.doc.palette).toBe(palettes[4 % 4]);
  });
});
