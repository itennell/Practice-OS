// npm run smoke: one real call per Meta model, each checked, then PASS/FAIL.
// Real API calls; not part of npm test or CI. Only fake content is sent.
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import sharp from "sharp";
import { loadEnv } from "../lib/env";
import {
  MetaApiError,
  chat,
  dataUrl,
  generateImage,
  pdfPart,
  readToolCalls,
  segmentImage,
  transcribe,
  transcriptText,
  searchGrounded,
} from "../lib/meta";
import { cutoutPng } from "../lib/cutout";
import { wordErrorRate } from "../lib/wer";
import { SAMPLE_CLIENT_NAME, makeSamplePdf } from "./make-sample-pdf";

loadEnv();

const FIXTURES = "tests/fixtures/meta";
const VOICEMAIL_TEXT = "Hi, this is Sam. I'd like to book a consultation. My number is 555-0100. Thanks.";
const FAKE_DEADLINE = "2026-12-31";

type Outcome = { name: string; ok: boolean; detail: string };
const outcomes: Outcome[] = [];

// Replace ids with stable placeholders so fixtures carry no account-specific values.
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) =>
        /^(id|item_id|response_id|sessionId|previous_response_id|system_fingerprint)$/.test(k) && typeof v === "string"
          ? [k, `redacted-${k}`]
          : [k, sanitize(v)],
      ),
    );
  }
  return value;
}

async function saveFixture(name: string, data: unknown) {
  await mkdir(FIXTURES, { recursive: true });
  await writeFile(`${FIXTURES}/${name}.json`, `${JSON.stringify(sanitize(data), null, 2)}\n`);
}

// `npm run smoke -- 4 6` runs only the steps whose numbers are given.
const only = process.argv.slice(2);

async function step(name: string, run: () => Promise<string>) {
  if (only.length > 0 && !only.some((n) => name.startsWith(n))) return;
  console.log(`\n=== ${name}`);
  try {
    const detail = await run();
    outcomes.push({ name, ok: true, detail });
    console.log(`PASS  ${detail}`);
  } catch (err) {
    const e = err instanceof MetaApiError ? err : new MetaApiError(String(err), null, null);
    const detail = `HTTP ${e.status ?? "-"} ${e.message}`;
    outcomes.push({ name, ok: false, detail });
    console.log(`FAIL  ${detail}`);
    if (e.body != null) console.log(`      error body: ${typeof e.body === "string" ? e.body : JSON.stringify(e.body)}`);
  }
}

function check(condition: boolean, message: string, body?: unknown): asserts condition {
  if (!condition) throw new MetaApiError(message, null, body ?? null);
}

// 1. Chat completion (cookbook 01_chat_completions.ipynb, cell 2).
await step("1. muse-spark-1.3 chat", async () => {
  const res = await chat("smoke.chat", {
    messages: [{ role: "user", content: "Reply with the single word: ready" }],
  });
  await saveFixture("chat", res);
  const reply = res.choices[0]?.message.content?.trim() ?? "";
  check(/^ready\.?$/i.test(reply), `Expected "ready", got ${JSON.stringify(reply)}`, res);
  return `reply "${reply}" | tokens ${res.usage?.total_tokens}`;
});

// 2. Tool call loop (cookbook 03_tool_calling.ipynb, cells 4 and 8).
await step("2. muse-spark-1.3 tool call", async () => {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "get_deadline",
        description: "Get the due date of a compliance deadline for the practice.",
        parameters: {
          type: "object",
          properties: {
            item: { type: "string", description: "The deadline, such as license renewal." },
          },
          required: ["item"],
        },
      },
    },
  ];
  const messages: Parameters<typeof chat>[1]["messages"] = [
    { role: "user", content: "When is my license renewal due? Use the get_deadline tool and give me the date." },
  ];
  const first = await chat("smoke.tool_call", { messages, tools });
  const message = first.choices[0]!.message;
  const calls = readToolCalls(message);
  check(calls.length > 0 && calls[0]!.name === "get_deadline", "The model did not call get_deadline.", first);
  check(calls[0]!.argsValid, "get_deadline arguments were not valid JSON.", message.tool_calls);

  messages.push(message);
  for (const call of calls) {
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ due: FAKE_DEADLINE }) });
  }
  const final = await chat("smoke.tool_call", { messages, tools });
  await saveFixture("tool_call", { first, final });
  const answer = final.choices[0]?.message.content ?? "";
  check(/2026-12-31|december 31,? 2026|12\/31\/2026/i.test(answer), `Final answer is missing the date: ${answer}`, final);
  const tokens = (first.usage?.total_tokens ?? 0) + (final.usage?.total_tokens ?? 0);
  return `args ${JSON.stringify(calls[0]!.args)} | answer "${answer.trim().slice(0, 80)}" | tokens ${tokens}`;
});

// 3. Image generation (cookbook 05_muse_image/01_image_api_fundamentals).
await step("3. muse-image-1.0 headshot", async () => {
  const { response, image } = await generateImage(
    "smoke.headshot",
    "Professional headshot portrait of Dana Reyes, a fictional licensed counselor in her early 40s, " +
      "warm and approachable smile, shoulders up, soft natural window light, plain soft lilac background, " +
      "photorealistic, no text",
  );
  await saveFixture("image", {
    ...response,
    output: response.output?.map((o) =>
      o.type === "image_generation_call" ? { ...o, result: `${o.result?.slice(0, 64)}...` } : o,
    ),
  });
  const jpeg = await sharp(image).resize({ width: 1080 }).jpeg({ quality: 90 }).toBuffer();
  await writeFile("test/headshot.jpg", jpeg);
  const meta = await sharp(await readFile("test/headshot.jpg")).metadata();
  check(meta.format === "jpeg" && meta.width === 1080, `Saved file is ${meta.format} ${meta.width}px`);
  return `source ${(await sharp(image).metadata()).format} -> test/headshot.jpg format ${meta.format}, ${meta.width}x${meta.height} | tokens ${response.usage?.total_tokens}`;
});

// 4. Segmentation (cookbook 07_sam/01_api_basics/typescript/sam-api.ts).
await step("4. sam-3.1 cut-out", async () => {
  const headshot = await readFile("test/headshot.jpg");
  const { result, usage, events } = await segmentImage("smoke.cutout", headshot, "image/jpeg", "person");
  await saveFixture("sam_events", events);
  const { png, alpha, width, height, transparentShare: transparent } = await cutoutPng(headshot, result);
  await writeFile("test/headshot-cutout.png", png);
  const meta = await sharp(png).metadata();
  check(meta.hasAlpha === true, "Cut-out has no alpha channel.");
  check(transparent > 0.1 && transparent < 0.9, `Transparent share ${(transparent * 100).toFixed(1)}% is outside 10-90%.`);
  // A headshot's subject fills the bottom-center and the top corners are background.
  // This catches a scrambled mask, which can still have a plausible transparent share.
  const at = (x: number, y: number) => alpha[Math.floor(y * height) * width + Math.floor(x * width)];
  check(at(0.5, 0.9) === 255 && at(0.5, 0.5) === 255, "Center and bottom-center of the cut-out are not opaque.");
  check(at(0.03, 0.03) === 0 && at(0.97, 0.03) === 0, "Top corners of the cut-out are not transparent.");
  const masks = result.records.filter((r) => r.kind === "mask").length;
  const images = (usage as { images_processed?: number } | null)?.images_processed;
  return `${masks} mask(s) | test/headshot-cutout.png alpha ${meta.hasAlpha}, ${(transparent * 100).toFixed(1)}% transparent | tokens ${usage?.total_tokens ?? "not reported"} (images processed: ${images ?? "-"})`;
});

// 5. Transcription (cookbook 06_muse_voice/01_voice_api_fundamentals/utils.py).
await step("5. muse-voice-transcribe-1.0 voicemail", async () => {
  await promisify(execFile)("ffmpeg", [
    "-y", "-loglevel", "error", "-i", "test/voicemail.m4a",
    "-ac", "1", "-ar", "24000", "-sample_fmt", "s16", "test/voicemail.wav",
  ]);
  const result = await transcribe("smoke.voicemail", "test/voicemail.wav");
  await saveFixture("transcribe", result);
  const text = transcriptText(result);
  const wer = wordErrorRate(VOICEMAIL_TEXT, text);
  check(wer < 0.2, `Word error rate ${(wer * 100).toFixed(0)}% for transcript: ${text}`, result);
  return `"${text}" | WER ${(wer * 100).toFixed(0)}% | ${((result.audioDurationMs ?? 0) / 1000).toFixed(1)}s audio | tokens not reported by this endpoint`;
});

// 6. PDF intake: file input (Meta docs, not cookbook), then PNG (cookbook 07_vision_input.ipynb, cell 4).
const { pdf, png } = await makeSamplePdf();
const question = "What is the client name on this intake form? Reply with the name only.";
const readsName = (s: string) => s.toLowerCase().includes(SAMPLE_CLIENT_NAME.toLowerCase());

await step("6a. muse-spark-1.3 PDF as file", async () => {
  const res = await chat("smoke.pdf_file", {
    messages: [
      {
        role: "user",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: [{ type: "text", text: question }, pdfPart(pdf, "sample.pdf") as any],
      },
    ],
  });
  await saveFixture("pdf_file", res);
  const reply = res.choices[0]?.message.content ?? "";
  check(readsName(reply), `Did not read the client name: ${reply}`, res);
  return `reply "${reply.trim()}" | tokens ${res.usage?.total_tokens}`;
});

await step("6b. muse-spark-1.3 PDF page as PNG", async () => {
  const res = await chat("smoke.pdf_png", {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: question },
          { type: "image_url", image_url: { url: dataUrl(png, "image/png") } },
        ],
      },
    ],
  });
  await saveFixture("pdf_png", res);
  const reply = res.choices[0]?.message.content ?? "";
  check(readsName(reply), `Did not read the client name: ${reply}`, res);
  return `reply "${reply.trim()}" | tokens ${res.usage?.total_tokens}`;
});

// 7. Search grounding (cookbook 10_search_grounding.ipynb, cells 4 and 10; results and
// user_location from Meta's search grounding guide). Asks a question we verified by hand
// (68 IAC 1375: LCPC licenses expire March 31 of odd years) and checks Muse found it on an
// official page. It also reports whether our saved quote appears in a cited passage.
await step("7. muse-spark-1.3 web search", async () => {
  const { response, answer } = await searchGrounded(
    "smoke.web_search",
    "When does an Illinois LCPC (licensed clinical professional counselor) license expire? Use the official IDFPR or Illinois Administrative Code pages and cite them.",
    { context: "low", location: { country: "US", region: "Illinois" } },
  );
  await saveFixture("web_search", response);
  check(answer.searched, "The model answered without searching.", response);
  check(answer.sources.length > 0 && answer.sources.every((s) => s.url && s.snippet !== undefined), "No search results came back.", response);
  const official = answer.sources.filter((s) => /\.gov\b|\.us\b/.test(new URL(s.url).hostname));
  check(official.length > 0, `No official (.gov) source among ${answer.sources.length} results.`, answer.sources);
  check(/march 31/i.test(answer.text), `The answer doesn't say March 31: ${answer.text}`, response);
  // Results carry empty snippets in practice; the evidence is the cited passage of the answer.
  const quote = "shall expire on march 31 of odd numbered years";
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ");
  const quoted = answer.citations.some((c) => norm(c.passage).includes(quote));
  const snippets = answer.sources.filter((s) => s.snippet).length;
  return `${answer.sources.length} sources (${official.length} official, ${snippets} with snippets), ${answer.citations.length} citations | our quote in a cited passage: ${quoted ? "yes" : "no"} | tokens ${answer.tokens}`;
});

console.log("\n=== Summary");
for (const o of outcomes) console.log(`${o.ok ? "PASS" : "FAIL"}  ${o.name}`);
const pdfFile = outcomes.find((o) => o.name.startsWith("6a"));
const pdfPng = outcomes.find((o) => o.name.startsWith("6b"));
if (pdfFile && pdfPng) {
  console.log(`PDF intake: file input ${pdfFile.ok ? "worked" : "did not work"}; PNG of the page ${pdfPng.ok ? "worked" : "did not work"}.`);
}
process.exit(outcomes.every((o) => o.ok) ? 0 : 1);
