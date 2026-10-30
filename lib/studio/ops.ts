// Edit operations on a StudioDoc (doc.ts). A closed list: chat ("make slide 2
// shorter") and the canvas (drag, click text, trim handles) both produce these,
// plain code validates each with zod and applies it as a pure function, then
// checks the result's shape. Muse only proposes; it can't write anything that
// isn't one of these.
//
// Slides, clips and texts are named by their number as she sees it (1 is the
// first) or by their id, so "slide 2" from chat and a drag on the canvas mean
// the same thing.
import { z } from "zod";
import {
  ASPECTS,
  ClipSchema,
  CueSchema,
  LIMITS,
  PALETTES,
  POSITIONS,
  allIds,
  newId,
  shapeProblems,
  videoSeconds,
  type StudioDoc,
} from "./doc";

const ref = z.union([z.number().int().min(1).max(50), z.string().min(1).max(40)]);
const text = (max: number) => z.string().trim().min(1).max(max);
const secs = z.number().finite().min(0).max(600);

export const OpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move_slide"), slide: ref, to: z.number().int().min(1).max(50) }),
  z.object({ op: z.literal("set_slide_text"), slide: ref, text: z.string().trim().max(LIMITS.slideText) }),
  z.object({ op: z.literal("shorten_slide"), slide: ref, text: text(LIMITS.slideText) }),
  z.object({ op: z.literal("set_slide_seconds"), slide: ref, seconds: z.number().min(LIMITS.slideSeconds.min).max(LIMITS.slideSeconds.max) }),
  z.object({ op: z.literal("add_slide"), after: z.number().int().min(0).max(50), text: text(LIMITS.slideText) }),
  z.object({ op: z.literal("remove_slide"), slide: ref }),
  z.object({ op: z.literal("set_title"), text: text(LIMITS.title) }),
  z.object({ op: z.literal("set_caption"), text: text(LIMITS.caption) }),
  z.object({ op: z.literal("set_palette"), palette: z.enum(PALETTES) }),
  z.object({ op: z.literal("set_aspect"), aspect: z.enum(ASPECTS) }),
  /** A new picture: the server draws it (an effect), the document only counts versions. */
  z.object({ op: z.literal("new_picture"), idea: z.string().trim().max(200).default("") }),
  z.object({ op: z.literal("trim_clip"), clip: ref, in: secs.optional(), out: secs.optional() }),
  /** "Cut the first 3 seconds": from the start of the first clip. */
  z.object({ op: z.literal("cut_start"), seconds: z.number().positive().max(600) }),
  /** "Cut the last 2 seconds": from the end of the last clip. */
  z.object({ op: z.literal("cut_end"), seconds: z.number().positive().max(600) }),
  /** Split a clip in two, `at` seconds into the part she kept. */
  z.object({ op: z.literal("split_clip"), clip: ref, at: z.number().positive().max(600) }),
  z.object({ op: z.literal("move_clip"), clip: ref, to: z.number().int().min(1).max(50) }),
  z.object({ op: z.literal("remove_clip"), clip: ref }),
  z.object({ op: z.literal("add_clip"), clip: ClipSchema }),
  z.object({ op: z.literal("add_text"), text: text(LIMITS.overlayText), start: secs, end: secs, position: z.enum(POSITIONS).default("bottom") }),
  z.object({ op: z.literal("edit_text"), overlay: ref, text: text(LIMITS.overlayText).optional(), start: secs.optional(), end: secs.optional(), position: z.enum(POSITIONS).optional() }),
  z.object({ op: z.literal("remove_text"), overlay: ref }),
  z.object({ op: z.literal("set_captions"), on: z.boolean() }),
  z.object({ op: z.literal("set_cues"), cues: z.array(CueSchema).max(400) }),
  z.object({ op: z.literal("set_cover"), slide: ref.optional(), time: secs.optional() }),
]);

export type Op = z.infer<typeof OpSchema>;
export type OpName = Op["op"];
export const OP_NAMES = OpSchema.options.map((o) => o.shape.op.value) as OpName[];

/** Ops that carry data only her browser has (a file she picked, captions from her audio); chat can't send them. */
export const CANVAS_ONLY: ReadonlySet<OpName> = new Set(["add_clip", "set_cues"]);

/** What the server has to do besides saving, for an op that needs more than the document. */
export type Effect = { kind: "picture"; idea: string };

export type ApplyResult = { ok: true; doc: StudioDoc; effects: Effect[] } | { ok: false; why: string };

class OpError extends Error {}
const fail = (why: string): never => {
  throw new OpError(why);
};

function indexOf<T extends { id: string }>(list: T[], r: number | string, noun: string): number {
  const i = typeof r === "number" ? r - 1 : list.findIndex((x) => x.id === r);
  if (i >= 0 && i < list.length) return i;
  if (!list.length) return fail(`There are no ${noun}s yet.`);
  return fail(typeof r === "number" ? `There's no ${noun} ${r}; there ${list.length === 1 ? "is 1" : `are ${list.length}`}.` : `That ${noun} isn't there any more.`);
}

function move<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

function applyOne(doc: StudioDoc, op: Op, effects: Effect[]): StudioDoc {
  switch (op.op) {
    case "move_slide": {
      const i = indexOf(doc.slides, op.slide, "slide");
      if (op.to > doc.slides.length) fail(`There are only ${doc.slides.length} slides.`);
      return { ...doc, slides: move(doc.slides, i, op.to - 1) };
    }
    case "set_slide_text": {
      const i = indexOf(doc.slides, op.slide, "slide");
      if (doc.slides[i].kind === "picture") fail(`Slide ${i + 1} is the picture; it has no words to change.`);
      return { ...doc, slides: doc.slides.map((s, k) => (k === i ? { ...s, text: op.text } : s)) };
    }
    case "shorten_slide": {
      const i = indexOf(doc.slides, op.slide, "slide");
      const before = doc.slides[i].text;
      if (doc.slides[i].kind === "picture") fail(`Slide ${i + 1} is the picture; it has no words to shorten.`);
      if (op.text.length >= before.trim().length || words(op.text) > words(before)) fail(`That wouldn't make slide ${i + 1} shorter.`);
      return { ...doc, slides: doc.slides.map((s, k) => (k === i ? { ...s, text: op.text } : s)) };
    }
    case "set_slide_seconds": {
      const i = indexOf(doc.slides, op.slide, "slide");
      return { ...doc, slides: doc.slides.map((s, k) => (k === i ? { ...s, seconds: round(op.seconds) } : s)) };
    }
    case "add_slide": {
      if (doc.kind === "post") fail("A single post has one slide. Ask for a carousel or a reel to add more.");
      // In a reel, how to book stays last.
      const max = doc.kind === "reel" && doc.slides.at(-1)?.kind === "book" ? doc.slides.length - 1 : doc.slides.length;
      const at = Math.min(op.after, max);
      const slide = { id: newId("s", allIds(doc)), kind: "point" as const, text: op.text, seconds: 3 };
      return { ...doc, slides: [...doc.slides.slice(0, at), slide, ...doc.slides.slice(at)] };
    }
    case "remove_slide": {
      const i = indexOf(doc.slides, op.slide, "slide");
      const s = doc.slides[i];
      if (s.kind !== "point") fail(s.kind === "picture" ? "The picture slide stays; ask for a new picture instead." : "How to book stays in; you can change its words.");
      const cover = doc.cover && "slide" in doc.cover && doc.cover.slide === s.id ? null : doc.cover;
      return { ...doc, cover, slides: doc.slides.filter((_, k) => k !== i) };
    }
    case "set_title":
      return { ...doc, title: op.text };
    case "set_caption":
      return { ...doc, caption: op.text };
    case "set_palette":
      return { ...doc, palette: op.palette };
    case "set_aspect":
      return { ...doc, aspect: op.aspect };
    case "new_picture":
      if (doc.kind === "video") fail("A video uses your own footage; pick a cover frame instead.");
      effects.push({ kind: "picture", idea: op.idea });
      return { ...doc, picture: doc.picture + 1 };
    case "trim_clip": {
      const i = indexOf(doc.clips, op.clip, "clip");
      const c = doc.clips[i];
      const next = { ...c, in: round(op.in ?? c.in), out: round(Math.min(op.out ?? c.out, c.duration)) };
      return { ...doc, clips: doc.clips.map((x, k) => (k === i ? next : x)) };
    }
    case "cut_start": {
      if (!doc.clips.length) fail("There's no video yet. Add one first.");
      const c = doc.clips[0];
      if (c.in + op.seconds >= c.out) fail(`The first clip is only ${round(c.out - c.in)} seconds.`);
      return { ...doc, clips: [{ ...c, in: round(c.in + op.seconds) }, ...doc.clips.slice(1)], overlays: shiftTexts(doc, -op.seconds) };
    }
    case "cut_end": {
      if (!doc.clips.length) fail("There's no video yet. Add one first.");
      const c = doc.clips.at(-1)!;
      if (c.out - op.seconds <= c.in) fail(`The last clip is only ${round(c.out - c.in)} seconds.`);
      return { ...doc, clips: [...doc.clips.slice(0, -1), { ...c, out: round(c.out - op.seconds) }] };
    }
    case "split_clip": {
      const i = indexOf(doc.clips, op.clip, "clip");
      const c = doc.clips[i];
      const cut = round(c.in + op.at);
      if (cut <= c.in || cut >= c.out) fail(`Clip ${i + 1} is ${round(c.out - c.in)} seconds; split it somewhere inside that.`);
      const second = { ...c, id: newId("c", allIds(doc)), in: cut };
      return { ...doc, clips: [...doc.clips.slice(0, i), { ...c, out: cut }, second, ...doc.clips.slice(i + 1)] };
    }
    case "move_clip": {
      const i = indexOf(doc.clips, op.clip, "clip");
      if (op.to > doc.clips.length) fail(`There are only ${doc.clips.length} clips.`);
      return { ...doc, clips: move(doc.clips, i, op.to - 1) };
    }
    case "remove_clip": {
      const i = indexOf(doc.clips, op.clip, "clip");
      return { ...doc, clips: doc.clips.filter((_, k) => k !== i) };
    }
    case "add_clip": {
      if (doc.kind !== "video") fail("Clips go in a video.");
      if (allIds(doc).includes(op.clip.id)) fail("That clip is already in.");
      return { ...doc, clips: [...doc.clips, op.clip] };
    }
    case "add_text": {
      const end = op.end > op.start ? op.end : op.start + 3;
      const o = { id: newId("o", allIds(doc)), text: op.text, start: round(op.start), end: round(end), position: op.position };
      return { ...doc, overlays: [...doc.overlays, o] };
    }
    case "edit_text": {
      const i = indexOf(doc.overlays, op.overlay, "text");
      const o = doc.overlays[i];
      const next = { ...o, text: op.text ?? o.text, start: round(op.start ?? o.start), end: round(op.end ?? o.end), position: op.position ?? o.position };
      return { ...doc, overlays: doc.overlays.map((x, k) => (k === i ? next : x)) };
    }
    case "remove_text": {
      const i = indexOf(doc.overlays, op.overlay, "text");
      return { ...doc, overlays: doc.overlays.filter((_, k) => k !== i) };
    }
    case "set_captions":
      return { ...doc, captions: { ...doc.captions, on: op.on } };
    case "set_cues":
      return { ...doc, captions: { on: true, cues: op.cues.map((c) => ({ start: round(c.start), end: round(c.end), text: c.text.trim() })).filter((c) => c.text && c.end > c.start) } };
    case "set_cover": {
      if (op.slide !== undefined) return { ...doc, cover: { slide: doc.slides[indexOf(doc.slides, op.slide, "slide")].id } };
      if (op.time !== undefined) return { ...doc, cover: { time: round(Math.min(op.time, videoSeconds(doc))) } };
      return fail("Say which slide or which moment should be the cover.");
    }
  }
}

/** Texts on the video move with a cut at the start, so they stay on the same moment. */
function shiftTexts(doc: StudioDoc, by: number) {
  return doc.overlays
    .map((o) => ({ ...o, start: round(Math.max(0, o.start + by)), end: round(o.end + by) }))
    .filter((o) => o.end > 0 && o.end > o.start);
}

/** Validates and applies a list of ops, all or nothing. The input document is never changed. */
export function applyOps(doc: StudioDoc, raw: unknown[], opts: { from?: "chat" | "canvas" } = {}): ApplyResult {
  if (!raw.length) return { ok: false, why: "Nothing to change." };
  if (raw.length > 20) return { ok: false, why: "That's too many changes at once. Try a few at a time." };
  const effects: Effect[] = [];
  let next = doc;
  try {
    for (const r of raw) {
      const parsed = OpSchema.safeParse(r);
      if (!parsed.success) return { ok: false, why: "Aeon didn't understand one of those changes." };
      if (opts.from === "chat" && CANVAS_ONLY.has(parsed.data.op)) return { ok: false, why: "That needs a file from your computer; use the buttons on the canvas." };
      next = applyOne(next, parsed.data, effects);
    }
  } catch (err) {
    if (err instanceof OpError) return { ok: false, why: err.message };
    throw err;
  }
  const problems = shapeProblems(next);
  if (problems.length) return { ok: false, why: problems[0] };
  return { ok: true, doc: next, effects };
}

/** One short line on what an op changed, for the history list and Aeon's reply. */
export function describeOp(op: Op): string {
  switch (op.op) {
    case "move_slide":
      return `Moved slide ${op.slide} to ${op.to}`;
    case "set_slide_text":
      return `Changed the words on slide ${op.slide}`;
    case "shorten_slide":
      return `Shortened slide ${op.slide}`;
    case "set_slide_seconds":
      return `Slide ${op.slide} now ${op.seconds} s`;
    case "add_slide":
      return `Added a slide after ${op.after}`;
    case "remove_slide":
      return `Took out slide ${op.slide}`;
    case "set_title":
      return "New headline";
    case "set_caption":
      return "New caption";
    case "set_palette":
      return `${op.palette[0].toUpperCase()}${op.palette.slice(1)} colours`;
    case "set_aspect":
      return `Shape ${op.aspect}`;
    case "new_picture":
      return "New picture";
    case "trim_clip":
      return `Trimmed clip ${op.clip}`;
    case "cut_start":
      return `Cut the first ${op.seconds} s`;
    case "cut_end":
      return `Cut the last ${op.seconds} s`;
    case "split_clip":
      return `Split clip ${op.clip}`;
    case "move_clip":
      return `Moved clip ${op.clip} to ${op.to}`;
    case "remove_clip":
      return `Took out clip ${op.clip}`;
    case "add_clip":
      return "Added a video";
    case "add_text":
      return `Added text "${op.text}"`;
    case "edit_text":
      return `Changed text ${op.overlay}`;
    case "remove_text":
      return `Took out text ${op.overlay}`;
    case "set_captions":
      return op.on ? "Captions on" : "Captions off";
    case "set_cues":
      return "Made captions";
    case "set_cover":
      return "New cover";
  }
}
