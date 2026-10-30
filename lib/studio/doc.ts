// The studio's one document model (Media › Instagram, chat-first studio). A
// post, carousel, slide reel or her own video is a StudioDoc: what the canvas
// draws, what chat edits change, and what Undo goes back through. Every change,
// typed in chat or made on the canvas, is a small edit operation (ops.ts), so
// there is one path and the history can't drift from what she sees.
//
// Her video files never live here: a clip keeps only a key into her browser's
// private storage and the times she picked.
import { z } from "zod";

export const KINDS = ["post", "carousel", "reel", "video"] as const;
export const ASPECTS = ["4:5", "1:1", "9:16"] as const;
export const PALETTES = ["calm", "warm", "cool", "bright"] as const;
export const SLIDE_KINDS = ["picture", "point", "book"] as const;
export const POSITIONS = ["top", "middle", "bottom"] as const;

export type Kind = (typeof KINDS)[number];
export type Aspect = (typeof ASPECTS)[number];
export type PaletteId = (typeof PALETTES)[number];
export type Position = (typeof POSITIONS)[number];

/** The limits plain code holds every document to, whatever chat or the canvas asked for. */
export const LIMITS = {
  slides: { min: 1, max: 10 },
  reelSlides: { min: 3, max: 6 },
  slideText: 90,
  title: 80,
  caption: 2200,
  slideSeconds: { min: 1, max: 10 },
  clips: 12,
  overlays: 12,
  overlayText: 80,
  videoSeconds: 90,
} as const;

/** Named colour sets (each pair passes WCAG AA; see tests/studio-doc.test.ts). */
export const PALETTE: Record<PaletteId, { label: string; paper: string; ink: string; muted: string; accent: string }> = {
  calm: { label: "Calm", paper: "#FAF9F5", ink: "#1F1E1D", muted: "#65635C", accent: "#5B47C9" },
  warm: { label: "Warm", paper: "#FBF1E6", ink: "#3A2418", muted: "#6E4F3E", accent: "#A2461F" },
  cool: { label: "Cool", paper: "#EEF3F8", ink: "#16283A", muted: "#4B5D70", accent: "#2E5CC8" },
  bright: { label: "Bright", paper: "#FFFFFF", ink: "#1F1E1D", muted: "#5A5852", accent: "#B0306E" },
};

const id = z.string().min(1).max(40);
const seconds = z.number().finite().min(0).max(600);

export const SlideSchema = z.object({
  id,
  kind: z.enum(SLIDE_KINDS),
  text: z.string().max(LIMITS.slideText),
  seconds: z.number().min(LIMITS.slideSeconds.min).max(LIMITS.slideSeconds.max),
});

export const ClipSchema = z.object({
  id,
  /** Key into her browser's private storage (OPFS); the file itself never reaches the server. */
  source: z.string().min(1).max(120),
  name: z.string().max(120),
  /** Length of the whole file, in seconds. */
  duration: z.number().positive().max(3600),
  /** The part of the file she kept. */
  in: seconds,
  out: seconds,
});

export const OverlaySchema = z.object({
  id,
  text: z.string().min(1).max(LIMITS.overlayText),
  /** Seconds on the finished video's timeline. */
  start: seconds,
  end: seconds,
  position: z.enum(POSITIONS),
});

export const CueSchema = z.object({ start: seconds, end: seconds, text: z.string().max(200) });

export const DocSchema = z.object({
  v: z.literal(1),
  kind: z.enum(KINDS),
  title: z.string().max(LIMITS.title),
  topic: z.string().max(300),
  aspect: z.enum(ASPECTS),
  palette: z.enum(PALETTES),
  caption: z.string().max(LIMITS.caption),
  /** Picture version; a new picture bumps it so the canvas reloads it. */
  picture: z.number().int().min(0),
  slides: z.array(SlideSchema).max(LIMITS.slides.max),
  clips: z.array(ClipSchema).max(LIMITS.clips),
  overlays: z.array(OverlaySchema).max(LIMITS.overlays),
  /** Auto captions: off until she taps Make captions. */
  captions: z.object({ on: z.boolean(), cues: z.array(CueSchema).max(400) }),
  /** The cover: a slide's id (slides) or a time on the video. */
  cover: z.union([z.object({ slide: id }), z.object({ time: seconds })]).nullable(),
});

export type Slide = z.infer<typeof SlideSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type Overlay = z.infer<typeof OverlaySchema>;
export type Cue = z.infer<typeof CueSchema>;
export type StudioDoc = z.infer<typeof DocSchema>;

/** Short ids for new slides, clips and overlays; unique within the document. */
export function newId(prefix: "s" | "c" | "o", taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

export function allIds(doc: StudioDoc): string[] {
  return [...doc.slides.map((s) => s.id), ...doc.clips.map((c) => c.id), ...doc.overlays.map((o) => o.id)];
}

export function emptyDoc(kind: Kind, topic = ""): StudioDoc {
  return {
    v: 1,
    kind,
    title: "",
    topic: topic.slice(0, 300),
    aspect: kind === "reel" || kind === "video" ? "9:16" : "4:5",
    palette: "calm",
    caption: "",
    picture: 0,
    slides: [],
    clips: [],
    overlays: [],
    captions: { on: false, cues: [] },
    cover: null,
  };
}

/** Length of the finished video: the kept part of each clip, in order. */
export function videoSeconds(doc: StudioDoc): number {
  return doc.clips.reduce((t, c) => t + Math.max(0, c.out - c.in), 0);
}

/** Length of a slide reel. */
export function reelSeconds(doc: StudioDoc): number {
  return doc.slides.reduce((t, s) => t + s.seconds, 0);
}

/**
 * Shape rules beyond the schema, in her words. Empty when the document is fine.
 * Safety (logistics only, never-show, self-harm) is checked separately (check.ts).
 */
export function shapeProblems(doc: StudioDoc): string[] {
  const p: string[] = [];
  const ids = allIds(doc);
  if (new Set(ids).size !== ids.length) p.push("Two parts have the same name.");
  if (doc.kind !== "video" && doc.slides.length < LIMITS.slides.min) p.push("There has to be at least one slide.");
  if (doc.kind === "post" && doc.slides.length > 1) p.push("A single post has one slide; make it a carousel for more.");
  if (doc.kind === "reel") {
    if (doc.slides.length < LIMITS.reelSlides.min || doc.slides.length > LIMITS.reelSlides.max) p.push(`A reel has ${LIMITS.reelSlides.min} to ${LIMITS.reelSlides.max} slides.`);
    if (doc.slides.filter((s) => s.kind === "picture").length !== 1) p.push("A reel shows your post picture once.");
    if (doc.slides.filter((s) => s.kind === "book").length !== 1) p.push("A reel ends with how to book, once.");
    else if (doc.slides.at(-1)?.kind !== "book") p.push("How to book stays the last slide.");
  }
  doc.slides.forEach((s, i) => {
    if (s.kind !== "picture" && !s.text.trim()) p.push(`Slide ${i + 1} has no words.`);
  });
  doc.clips.forEach((c, i) => {
    if (c.in >= c.out) p.push(`Clip ${i + 1} has nothing left after the trim.`);
    if (c.out > c.duration + 0.001) p.push(`Clip ${i + 1} ends after the video does.`);
  });
  const total = videoSeconds(doc);
  if (doc.kind === "video" && total > LIMITS.videoSeconds) p.push(`A reel is at most ${LIMITS.videoSeconds} seconds; this one is ${Math.round(total)}.`);
  doc.overlays.forEach((o, i) => {
    if (o.start >= o.end) p.push(`Text ${i + 1} ends before it starts.`);
    if (doc.kind === "video" && o.start >= total) p.push(`Text ${i + 1} starts after the video ends.`);
  });
  if (doc.cover && "slide" in doc.cover && !doc.slides.some((s) => s.id === (doc.cover as { slide: string }).slide)) p.push("The cover slide isn't there any more.");
  if (doc.cover && "time" in doc.cover && doc.kind === "video" && doc.cover.time > total) p.push("The cover frame is after the video ends.");
  return p;
}

/** Parses untrusted JSON (the database, the browser) into a document, or null. */
export function parseDoc(raw: unknown): StudioDoc | null {
  const r = DocSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Every word in the document that reaches a post, for the safety checks. */
export function docWords(doc: StudioDoc): string[] {
  return [doc.title, doc.caption, ...doc.slides.map((s) => s.text), ...doc.overlays.map((o) => o.text), ...doc.captions.cues.map((c) => c.text)].filter((t) => t.trim());
}
