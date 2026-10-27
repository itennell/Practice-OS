// Offline checks of lib/meta.ts parsing against real replies saved by `npm run smoke`.
import { readFile } from "node:fs/promises";
import { parseImageStream, type ResponsesEvent } from "@meta-sam/parser";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cutoutPng } from "../lib/cutout";
import {
  MetaApiError,
  assertAllowedModel,
  extractImage,
  pdfPart,
  readGrounded,
  readToolCalls,
  transcriptText,
  validateSegmentation,
} from "../lib/meta";
import { normalizeWords, wordErrorRate } from "../lib/wer";

const fixture = async (name: string) => JSON.parse(await readFile(`tests/fixtures/meta/${name}.json`, "utf8"));

describe("model guard", () => {
  it("refuses model IDs ending in -contributor", () => {
    expect(() => assertAllowedModel("muse-spark-1.3-contributor")).toThrow(MetaApiError);
    expect(() => assertAllowedModel("muse-spark-1.3")).not.toThrow();
  });
});

describe("chat", () => {
  it("reads the reply and token usage", async () => {
    const res = await fixture("chat");
    expect(res.choices[0].message.content.trim().toLowerCase()).toMatch(/^ready\.?$/);
    expect(res.usage.total_tokens).toBeGreaterThan(0);
  });

  it("parses tool calls and their JSON arguments", async () => {
    const { first, final } = await fixture("tool_call");
    const [call] = readToolCalls(first.choices[0].message);
    expect(call).toMatchObject({ name: "get_deadline", argsValid: true });
    expect(final.choices[0].message.content).toContain("2026-12-31");
  });

  it("flags tool arguments that are not valid JSON", () => {
    const [call] = readToolCalls({
      role: "assistant",
      content: null,
      refusal: null,
      tool_calls: [{ id: "t1", type: "function", function: { name: "get_deadline", arguments: "{oops" } }],
    });
    expect(call.argsValid).toBe(false);
  });

  it("builds the PDF file part from Meta's docs", () => {
    const part = pdfPart(Buffer.from("%PDF-1.7"), "sample.pdf");
    expect(part.type).toBe("file");
    expect(part.file.filename).toBe("sample.pdf");
    expect(part.file.file_data.startsWith("data:application/pdf;base64,")).toBe(true);
  });
});

describe("image", () => {
  it("finds the image_generation_call and decodes it", async () => {
    const res = await fixture("image");
    expect(extractImage(res).length).toBeGreaterThan(0);
    expect(res.usage.total_tokens).toBeGreaterThan(0);
  });

  it("throws when there is no image in the reply", () => {
    expect(() => extractImage({ output: [{ type: "message" }] })).toThrow(MetaApiError);
  });
});

describe("SAM cut-out", () => {
  it("parses the saved stream and builds a correctly placed cut-out", async () => {
    const events: ResponsesEvent[] = await fixture("sam_events");
    async function* replay() {
      for (const e of events) yield e;
    }
    const result = await parseImageStream(replay()).finalResult;
    validateSegmentation(result);

    // A plain 1080x1080 image stands in for the headshot; only the mask matters here.
    const image = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#888888" } })
      .jpeg()
      .toBuffer();
    const { png, alpha, width, transparentShare } = await cutoutPng(image, result);
    const meta = await sharp(png).metadata();
    const at = (x: number, y: number) => alpha[Math.floor(y * width) * width + Math.floor(x * width)];

    expect(meta.channels).toBe(4);
    expect(transparentShare).toBeGreaterThan(0.1);
    expect(transparentShare).toBeLessThan(0.9);
    expect(at(0.5, 0.5)).toBe(255); // face
    expect(at(0.5, 0.9)).toBe(255); // shoulders
    expect(at(0.03, 0.03)).toBe(0); // background corners
    expect(at(0.97, 0.03)).toBe(0);
  });
});

describe("transcription", () => {
  it("reads the transcript and scores it against the script", async () => {
    const res = await fixture("transcribe");
    const text = transcriptText(res);
    // Same bar as npm run smoke: transcripts vary a little run to run.
    expect(wordErrorRate("Hi, this is Sam. I'd like to book a consultation. My number is 555-0100. Thanks.", text)).toBeLessThan(0.2);
  });

  it("joins turns when there is no top-level transcript", () => {
    expect(transcriptText({ turns: [{ transcript: "Hello" }, { transcript: "there" }] })).toBe("Hello there");
  });

  it("treats spoken and written digits the same", () => {
    expect(normalizeWords("555-0100")).toEqual(normalizeWords("five five five oh one zero zero"));
  });
});

describe("search grounding", () => {
  it("reads sources, citations and the answer by item type", async () => {
    const a = readGrounded(await fixture("web_search"));
    expect(a.searched).toBe(true);
    expect(a.sources.length).toBeGreaterThan(0);
    for (const s of a.sources) expect(s.url).toMatch(/^https?:\/\//);
    expect(a.sources.some((s) => /\.gov$/.test(new URL(s.url).hostname))).toBe(true);
    expect(a.text).toMatch(/March 31/);
    expect(a.tokens).toBeGreaterThan(0);
  });

  it("ties each citation to the passage it backs (Illinois LCPC rule, 68 IAC 1375.200)", async () => {
    const a = readGrounded(await fixture("web_search"));
    const cited = a.citations.find((c) => /shall expire on march 31 of odd numbered years/i.test(c.passage));
    expect(cited?.url).toMatch(/ilga\.gov.*0137/i);
  });

  it("reports no search when the model answered from memory", () => {
    const a = readGrounded({ output: [{ type: "message", content: [{ type: "output_text", text: "Paris", annotations: [] }] }] });
    expect(a).toMatchObject({ searched: false, sources: [], citations: [], text: "Paris" });
  });
});
