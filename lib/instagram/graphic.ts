// One post picture, made by three models and plain code working together
// (Isaiah, 2026-10-28: code does every word, Muse Image draws):
//   1. SAM 3.1 cuts Dana out of her generated headshot (lib/meta segmentImage,
//      cookbook 07_sam), once per run.
//   2. Muse Image draws a wordless background, told where the headline and the
//      portrait will sit so it leaves those areas calm (cookbook 05_muse_image).
//   3. Code lays out the headline, the cut-out and the footer at exact
//      positions. Words are drawn as Inter glyph outlines (opentype.js), so they
//      are always spelled right and look the same on every computer.
//   4. Muse Spark looks at the finished picture (cookbook 07_vision_input) and
//      it is redrawn once if the check fails.
import { readFile } from "node:fs/promises";
import path from "node:path";
import opentype from "opentype.js";
import sharp, { type OverlayOptions } from "sharp";
import { cutoutPng } from "../cutout";
import { chat as metaChat, dataUrl, generateImage, segmentImage } from "../meta";
import type { ChatFn } from "./critic";
import { POST_HEIGHT, POST_WIDTH, toInstagramJpeg } from "./image";
import type { Pillar } from "./pillars";

// ---- layout (1080 x 1350) -------------------------------------------------------------

export const LAYOUT = {
  margin: 72,
  headline: { top: 96, size: 84, lineHeight: 1.08, maxLines: 3 },
  /** The portrait sits in the lower right; its top edge is this far down. */
  portrait: { height: 760, rightInset: 24 },
  footer: { size: 30, gap: 10 },
} as const;

/** Where things go, in words Muse Image can follow. */
export const LAYOUT_BRIEF =
  "Layout of the 4:5 portrait poster: the top 40% is a calm, plain, light area that will hold a large dark headline added later; " +
  "the lower right 60% will hold a cut-out portrait of a woman added later, so keep it soft and uncluttered; " +
  "the bottom-left corner holds a small footer added later.";

const INK = "#1F1E1D";
const MUTED = "#65635C";
const CARD = "#FFFFFF";

// ---- fonts and words ----------------------------------------------------------------------

type Font = opentype.Font;
let fonts: Promise<{ bold: Font; regular: Font }> | null = null;
function loadFonts() {
  fonts ??= (async () => {
    // @fontsource/inter (SIL Open Font License 1.1).
    const dir = path.join(process.cwd(), "node_modules/@fontsource/inter/files");
    const load = async (file: string) => {
      const buf = await readFile(path.join(dir, file));
      return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    };
    return { bold: await load("inter-latin-700-normal.woff"), regular: await load("inter-latin-400-normal.woff") };
  })();
  return fonts;
}

/** Greedy word wrap by measured width. Throws when the headline needs too many lines. */
export function wrap(font: Font, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.getAdvanceWidth(next, size) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pathFor(font: Font, text: string, x: number, baseline: number, size: number, fill: string) {
  return `<path fill="${fill}" d="${font.getPath(text, x, baseline, size).toPathData(2)}"/>`;
}

export type Words = { headline: string; practiceName: string; licenseLine: string };

/** The words as an SVG overlay: a white card behind the headline for contrast, and the footer. */
export async function wordsSvg(w: Words): Promise<{ svg: Buffer; headlineBottom: number }> {
  const { bold, regular } = await loadFonts();
  const { margin, headline: h, footer: f } = LAYOUT;
  const maxWidth = POST_WIDTH - margin * 2 - 48;
  let size: number = h.size;
  let lines = wrap(bold, w.headline, size, maxWidth);
  while (lines.length > h.maxLines && size > 56) {
    size -= 6;
    lines = wrap(bold, w.headline, size, maxWidth);
  }
  if (lines.length > h.maxLines) throw new Error(`The headline "${w.headline}" is too long for the picture.`);
  const lineGap = size * h.lineHeight;
  const cardTop = h.top - 32;
  const cardHeight = lines.length * lineGap + 56;
  const cardWidth = Math.max(...lines.map((l) => bold.getAdvanceWidth(l, size))) + 48;
  const parts = [
    `<rect x="${margin - 24}" y="${cardTop}" width="${cardWidth}" height="${cardHeight}" rx="28" fill="${CARD}" fill-opacity="0.92"/>`,
    ...lines.map((l, i) => pathFor(bold, l, margin, h.top + size * 0.82 + i * lineGap, size, INK)),
  ];
  // Footer: practice name, then the exact license line, on a soft card.
  const fy = POST_HEIGHT - margin - f.size - f.gap;
  const footW = Math.max(bold.getAdvanceWidth(w.practiceName, f.size), regular.getAdvanceWidth(w.licenseLine, f.size - 6)) + 40;
  parts.push(
    `<rect x="${margin - 20}" y="${fy - f.size - 14}" width="${footW}" height="${f.size * 2 + f.gap + 30}" rx="20" fill="${CARD}" fill-opacity="0.9"/>`,
    pathFor(bold, w.practiceName, margin, fy, f.size, INK),
    pathFor(regular, w.licenseLine, margin, fy + f.size + f.gap - 4, f.size - 6, MUTED),
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${POST_WIDTH}" height="${POST_HEIGHT}">${parts.join("")}</svg>`;
  return { svg: Buffer.from(svg), headlineBottom: cardTop + cardHeight };
}

/** SAM's mask is coarse; a slight blur of the alpha channel hides the stair-step edge. */
async function softEdges(png: Buffer): Promise<Buffer> {
  const { width, height, hasAlpha } = await sharp(png).metadata();
  if (!hasAlpha || !width || !height) return png;
  const alpha = await sharp(png).extractChannel(3).blur(1.6).raw().toBuffer();
  // removeAlpha() must run in its own pipeline: chained, sharp applies it last and drops the new mask (see lib/cutout.ts).
  const rgb = await sharp(png).removeAlpha().raw().toBuffer();
  return sharp(rgb, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

/** Background + cut-out + words, as Instagram's JPEG. */
export async function composePost(input: { background: Buffer; cutout: Buffer | null; words: Words }): Promise<Buffer> {
  const bg = await sharp(input.background).resize(POST_WIDTH, POST_HEIGHT, { fit: "cover" }).toBuffer();
  const { svg, headlineBottom } = await wordsSvg(input.words);
  const layers: OverlayOptions[] = [];
  if (input.cutout) {
    const height = Math.min(LAYOUT.portrait.height, POST_HEIGHT - headlineBottom - 24);
    const portrait = await softEdges(await sharp(input.cutout).trim().resize({ height, fit: "inside" }).png().toBuffer());
    const { width = 0 } = await sharp(portrait).metadata();
    layers.push({ input: portrait, top: POST_HEIGHT - height, left: POST_WIDTH - width - LAYOUT.portrait.rightInset });
  }
  layers.push({ input: svg, top: 0, left: 0 });
  return toInstagramJpeg(await sharp(bg).composite(layers).png().toBuffer());
}

// ---- the models ---------------------------------------------------------------------------

const HEADSHOT = "public/demo/dana-reyes-headshot.jpg";
let cutoutCache: Promise<Buffer> | null = null;

/** SAM 3.1: Dana without her background. Once per run; the headshot never changes. */
export function danaCutout(): Promise<Buffer> {
  cutoutCache ??= (async () => {
    const headshot = await readFile(path.join(process.cwd(), HEADSHOT));
    const { result } = await segmentImage("instagram.cutout", headshot, "image/jpeg", "person");
    const { png, transparentShare } = await cutoutPng(headshot, result);
    if (transparentShare < 0.05 || transparentShare > 0.95) throw new Error("The cut-out of Dana's photo didn't come out right.");
    return png;
  })().catch((err) => {
    cutoutCache = null;
    throw err;
  });
  return cutoutCache;
}

const NEVER_SCENE: Record<string, string> = {
  office: "No office rooms, desks or therapy rooms.",
  home: "No homes, kitchens or living rooms.",
  family: "No family photos or family scenes.",
};

export function backgroundPrompt(pillar: Pillar, retryNote?: string, neverShow: string[] = []): string {
  const avoid = neverShow.map((n) => NEVER_SCENE[n]).filter(Boolean);
  return [
    `A calm, warm, minimal illustrated background for a therapy practice's Instagram post about ${pillar.scene}.`,
    LAYOUT_BRIEF,
    "Style: soft paper texture, gentle shapes, warm neutrals (cream #FAF9F5, sand, stone) with a little soft lavender #E3D9FF and one small touch of violet #5B47C9.",
    "Absolutely no text, letters, numbers, signs or logos. No people, faces or hands. No medical or clinical objects, no pills, no couches with patients.",
    avoid.length ? `${avoid.join(" ")} Show a neutral scene instead, like soft shapes, plants or a calendar.` : "",
    retryNote ? `Fix from the last try: ${retryNote}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "problems"],
  properties: {
    ok: { type: "boolean" },
    problems: { type: "array", items: { type: "string" }, description: "Short, plain words. Empty when ok." },
  },
} as const;

export type GraphicCheck = { ok: boolean; problems: string[] };

/** Muse Spark looks at the finished picture. */
export async function checkGraphic(jpeg: Buffer, words: Words, callModel: ChatFn = metaChat): Promise<GraphicCheck> {
  const res = await callModel("instagram.graphic_check", {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Check this Instagram post picture for a therapy practice. It must: show the headline "${words.headline}" clearly readable; ` +
              "show at most one person (the clinician) and no other faces; contain no other text, letters or logos apart from the headline and the small footer; " +
              "contain nothing medical, clinical, distressing or about self-harm; look calm and professional. Reply with JSON only.",
          },
          { type: "image_url", image_url: { url: dataUrl(jpeg, "image/jpeg") } },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "graphic_check", schema: CHECK_SCHEMA as never } },
  });
  try {
    const parsed = JSON.parse(res.choices[0]?.message.content ?? "") as GraphicCheck;
    if (typeof parsed.ok !== "boolean" || !Array.isArray(parsed.problems)) throw new Error();
    return { ok: parsed.ok && parsed.problems.length === 0, problems: parsed.problems.map(String).slice(0, 5) };
  } catch {
    return { ok: false, problems: ["The picture check didn't answer clearly."] };
  }
}

export type GraphicDeps = {
  cutout?: () => Promise<Buffer | null>;
  background?: (prompt: string) => Promise<Buffer>;
  chat?: ChatFn;
  /** Her "never show" picks from onboarding: "face" leaves her photo out; the rest stay out of the background. */
  neverShow?: string[];
  /** A new picture she asked for in the studio ("swap the picture"): what should be different. */
  idea?: string;
};

export type Graphic = { jpeg: Buffer; check: GraphicCheck; tries: number; backgroundPrompt: string };

/** Tests and recorded conversations only (PLAYWRIGHT_IMAGE_STANDIN=1, like the Cal.com stand-in): a plain background, no image or photo model. */
async function standIn(words: Words): Promise<Graphic> {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") throw new Error("PLAYWRIGHT_IMAGE_STANDIN is for tests only.");
  const background = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#EDE7F6" } }).png().toBuffer();
  return { jpeg: await composePost({ background, cutout: null, words }), check: { ok: true, problems: [] }, tries: 1, backgroundPrompt: "(stand-in)" };
}

/** Draw, lay out, check; one redraw when the check fails. */
export async function designPost(pillar: Pillar, words: Words, deps: GraphicDeps = {}): Promise<Graphic> {
  if (process.env.PLAYWRIGHT_IMAGE_STANDIN === "1") return standIn(words);
  const never = deps.neverShow ?? [];
  const cutout = never.includes("face") ? null : await (deps.cutout ?? danaCutout)();
  const draw = deps.background ?? (async (prompt: string) => (await generateImage("instagram.background", prompt)).image);
  let note: string | undefined = deps.idea;
  let last: Graphic | null = null;
  for (let tries = 1; tries <= 2; tries++) {
    const prompt = backgroundPrompt(pillar, note, never);
    const jpeg = await composePost({ background: await draw(prompt), cutout, words });
    const check = await checkGraphic(jpeg, words, deps.chat);
    last = { jpeg, check, tries, backgroundPrompt: prompt };
    if (check.ok) return last;
    note = check.problems.join("; ");
  }
  return last!;
}
