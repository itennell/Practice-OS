// Items #6 and #10 of the Nov 2 re-test: a whole-post "make it shorter" shortens the
// caption too, and a saved post or studio project whose words her saved details now
// contradict is flagged "Facts changed" (no data migration). Model calls are stubbed.
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { regeneratePostRequest } from "../components/instagram/instagram-board";
import { regenerateRequest } from "../components/studio/studio";
import { closeDb, db } from "../lib/db";
import type { ChatFn } from "../lib/instagram/critic";
import type { SearchFn } from "../lib/instagram/research";
import { listPosts, practiceFacts } from "../lib/instagram/store";
import { truthOf } from "../lib/media/truth";
import { SHORT_CAPTION, shortenCaption, wantsWholeShorter } from "../lib/studio/edit";
import { factsChanged } from "../lib/studio/stale";
import { chatEdit, getProject, makeProject, type MakeEvent } from "../lib/studio/store";
import { DANA } from "./media-fixtures";

const LINE = "Dana Reyes, LCPC (fictional demo practice)";
const LONG_BODY =
  "A first session is $200 and it runs about an hour. After that, a therapy session of 38 to 52 minutes is $150. " +
  "A longer session of 53 minutes or more is $175. I can give you a superbill on request, and you can send it to your insurer. " +
  "Many plans pay back part of the cost for out-of-network care, so it is worth calling the number on your card to ask. " +
  "Booking is simple: pick a time on my booking page, and you will get a short form to fill in before we meet. " +
  "Sessions are in person in Lincoln Park or by video, whichever suits your week.";

describe("whole-post 'make it shorter'", () => {
  it("knows a whole-post ask from a named part", () => {
    expect(wantsWholeShorter("make it shorter")).toBe(true);
    expect(wantsWholeShorter("shorten this please")).toBe(true);
    expect(wantsWholeShorter("make slide 2 shorter")).toBe(false);
    expect(wantsWholeShorter("make the title shorter")).toBe(false);
    expect(wantsWholeShorter("warmer colours")).toBe(false);
  });

  it("halves a long caption, keeps every price, the hashtags and the license line", () => {
    const caption = `${LONG_BODY} #therapy #chicago\n\n${LINE}`;
    expect(caption.length).toBeGreaterThan(500);
    const short = shortenCaption(caption, LINE)!;
    expect(short.length).toBeLessThan(caption.length * 0.75);
    expect(short.endsWith(LINE)).toBe(true);
    for (const price of ["$200", "$150", "$175"]) expect(short).toContain(price);
    expect(short).toContain("#therapy #chicago");
    expect(short.slice(0, -LINE.length).trim().length).toBeLessThanOrEqual(SHORT_CAPTION + 40);
  });

  it("leaves a one-sentence caption alone", () => {
    expect(shortenCaption(`Book a time online.\n\n${LINE}`, LINE)).toBeNull();
  });
});

describe("facts changed flag", () => {
  const truth = truthOf(DANA);
  it("names what an old post says that her saved details now contradict, in plain words", () => {
    const flags = factsChanged(["Private pay, no insurance", "I send monthly superbills."], truth);
    expect(flags.some((f) => /insurance/i.test(f) && /Blue Cross/i.test(f))).toBe(true);
    expect(flags.some((f) => /superbill/i.test(f))).toBe(true);
    expect(flags.every((f) => f.startsWith("It ") && f.endsWith("."))).toBe(true);
  });

  it("flags nothing for words that still agree, or when her facts can't be read", () => {
    expect(factsChanged([`A therapy session is $150.\n\n${LINE}`], truth)).toEqual([]);
    expect(factsChanged(["Private pay, no insurance"], null)).toEqual([]);
  });

  it("Regenerate asks for the same kind on the same topic", () => {
    expect(regenerateRequest({ kind: "carousel", topic: "fees and how superbills work", title: "Fees" })).toBe("Make a new carousel about fees and how superbills work");
    expect(regenerateRequest({ kind: "reel", topic: "Make a reel about how booking works", title: "" })).toBe("Make a new reel about how booking works");
    expect(regeneratePostRequest({ headline: "[Sample] Private pay, no insurance", pillar: "fees_superbills" })).toEqual({ request: "A new post about Private pay, no insurance", pillar: "fees_superbills" });
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

const search: SearchFn = async () => ({ text: "Therapists post plain how-it-works posts.", searched: true, sources: [], citations: [], tokens: 0 });

function stub(edit: unknown) {
  return (async (feature: string) => {
    const reply = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
    if (feature === "instagram.research.angles")
      return reply({ summary: "Plain posts.", angles: [{ title: "How fees work", hook: "Here is what it costs.", format: "carousel", why: "Clear.", pillar: "fees_superbills", source_numbers: [] }] });
    if (feature === "instagram.write")
      return reply({ posts: [{ pillar: "fees_superbills", headline: "How fees work", body: "A therapy session is $150. I can give you a superbill on request.", alt_text: "A calm office" }] });
    if (feature === "instagram.critic") return reply({ breaks: [] });
    if (feature === "instagram.graphic_check") return reply({ ok: true, problems: [] });
    if (feature === "instagram.reel") return reply({ points: ["A therapy session is $150", "Superbills on request"], book: "Book online. Link in bio." });
    if (feature === "studio.edit") return reply(edit);
    throw new Error(`unexpected model call ${feature}`);
  }) as unknown as ChatFn;
}

const graphic = {
  cutout: async () => null,
  background: () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#EDE7F6" } }).png().toBuffer(),
};

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

describe.skipIf(!hasDb)("stored projects and posts", { timeout: 120_000 }, () => {
  async function carousel() {
    const events: MakeEvent[] = [];
    const project = await makeProject("test", "make a carousel about my fees and how superbills work", (e) => events.push(e), { chat: stub({ reply: "", ops: [] }), search, graphic });
    expect(project, JSON.stringify(events.filter((e) => e.type === "stop"))).not.toBeNull();
    return project!;
  }

  it("a whole-post 'make it shorter' shortens the long caption as well as the slides", async () => {
    const { licenseLine } = await practiceFacts();
    const p = await carousel();
    const caption = `${LONG_BODY}\n\n${licenseLine}`;
    await db()`update practice_os.studio_projects set doc = jsonb_set(doc, '{caption}', to_jsonb(${caption}::text)) where id = ${p.id}`;
    const r = await chatEdit(p.id, "make it shorter", { by: "test", chat: stub({ reply: "Slide 2 is shorter.", ops: [{ op: "shorten_slide", slide: 2, text: "Sessions $150" }] }) });
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    if (!r.ok) return;
    expect(r.project.doc.slides[1].text).toBe("Sessions $150");
    expect(r.project.doc.caption.length).toBeLessThan(caption.length * 0.75);
    expect(r.project.doc.caption.endsWith(licenseLine)).toBe(true);
    expect(r.reply).toMatch(/caption is shorter/i);
  });

  it("an old project or post with words her facts now contradict opens with the flag; a fresh one doesn't", async () => {
    const p = await carousel();
    expect((await getProject(p.id))!.factsChanged).toEqual([]);
    await db()`update practice_os.studio_projects set doc = jsonb_set(doc, '{title}', to_jsonb('I send monthly superbills'::text)) where id = ${p.id}`;
    const stale = (await getProject(p.id))!;
    expect(stale.factsChanged.some((f) => /superbill/i.test(f))).toBe(true);

    await db()`update practice_os.posts set caption = ${"I send monthly superbills."} where id = ${p.postId}`;
    const post = (await listPosts()).find((x) => x.id === p.postId)!;
    expect(post.factsChanged.some((f) => /superbill/i.test(f))).toBe(true);
  });
});
