// The only client for the Meta model API (AGENTS.md > Architecture).
// Request shapes are copied from meta-models/meta-model-cookbook at commit
// 0a99b987858ec4e49c04fc3f114bf33851e81deb; each function names its source.
import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import {
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ImageSegmentationResult,
  type ResponsesEvent,
} from "@meta-sam/parser";
import { requireEnv } from "./env";
import { logModelCall } from "./model-calls";

export const META_BASE_URL = "https://api.meta.ai/v1";

export const MODELS = {
  chat: "muse-spark-1.3",
  image: "muse-image-1.0",
  segment: "sam-3.1",
  transcribe: "muse-voice-transcribe-1.0",
} as const;

// Cookbook README "Getting started": the SDK does not read MODEL_API_KEY itself.
export function metaClient(): OpenAI {
  return new OpenAI({ baseURL: META_BASE_URL, apiKey: requireEnv("MODEL_API_KEY") });
}

/** Thrown for any non-2xx reply; keeps the status and the server's body. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body: unknown,
  ) {
    super(message);
  }
}

function toMetaError(err: unknown): MetaApiError {
  if (err instanceof MetaApiError) return err;
  if (err instanceof OpenAI.APIError) {
    return new MetaApiError(err.message, err.status ?? null, err.error ?? null);
  }
  return new MetaApiError(err instanceof Error ? err.message : String(err), null, null);
}

/** AGENTS.md: never use a model ID ending in "-contributor". */
export function assertAllowedModel(model: string): void {
  if (model.endsWith("-contributor")) {
    throw new MetaApiError(`Model ${model} is not allowed (AGENTS.md).`, null, null);
  }
}

/** Times a call, logs it in model_calls shape, and normalizes errors. */
async function tracked<T>(
  model: string,
  feature: string,
  run: () => Promise<T>,
  tokensOf: (result: T) => number | null,
): Promise<T> {
  assertAllowedModel(model);
  const started = Date.now();
  try {
    const result = await run();
    await logModelCall({ model, feature, tokens: tokensOf(result), ms: Date.now() - started, ok: true });
    return result;
  } catch (err) {
    await logModelCall({ model, feature, tokens: null, ms: Date.now() - started, ok: false });
    throw toMetaError(err);
  }
}

// ---- Muse Spark: chat completions -------------------------------------------
// Cookbook: 01_api_fundamentals/01_chat_completions.ipynb (cell 2),
// 03_tool_calling.ipynb (cells 4, 8), 07_vision_input.ipynb (cell 4).

export type ChatParams = Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, "model">;

export function chat(feature: string, params: ChatParams) {
  return tracked(
    MODELS.chat,
    feature,
    () => metaClient().chat.completions.create({ ...params, model: MODELS.chat }),
    (r) => r.usage?.total_tokens ?? null,
  );
}

/** Tool calls on an assistant message, with arguments parsed as JSON. */
export function readToolCalls(message: OpenAI.Chat.ChatCompletionMessage) {
  return (message.tool_calls ?? []).map((call) => {
    let args: unknown = null;
    let argsValid = true;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      argsValid = false;
    }
    return { id: call.id, name: call.function.name, args, argsValid };
  });
}

export function dataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

// PDF input is NOT in the cookbook. Shape from Meta's docs:
// https://dev.meta.ai/docs/file-handling (Chat Completions, "file" content part).
export function pdfPart(bytes: Buffer, filename: string) {
  return {
    type: "file" as const,
    file: { filename, file_data: dataUrl(bytes, "application/pdf") },
  };
}

// ---- Muse Image: Responses API ----------------------------------------------
// Cookbook: 05_muse_image/01_image_api_fundamentals/README.md ("Generate", save_image).

type ResponseLike = {
  output?: Array<{ type: string; result?: string | null }>;
  usage?: { total_tokens?: number } | null;
};

/** Finds the image_generation_call item and decodes its base64 result. */
export function extractImage(response: ResponseLike): Buffer {
  const item = response.output?.find((o) => o.type === "image_generation_call");
  if (!item?.result) throw new MetaApiError("No image_generation_call in the response.", null, response);
  return Buffer.from(item.result, "base64");
}

export async function generateImage(feature: string, prompt: string) {
  const response = await tracked(
    MODELS.image,
    feature,
    () =>
      metaClient().responses.create({ model: MODELS.image, input: prompt }) as unknown as Promise<
        ResponseLike & { id: string; status?: string }
      >,
    (r) => r.usage?.total_tokens ?? null,
  );
  return { response, image: extractImage(response) };
}

// ---- SAM 3.1: streaming Responses API ----------------------------------------
// Cookbook: 07_sam/01_api_basics/typescript/sam-api.ts (segmentImage,
// normalizedEvents, validateResult).

// The API streams response.content_part.done but not response.output_text.done,
// which the parser needs; synthesize it (copied from the cookbook). Also keeps
// the usage from response.completed, which the parser does not expose.
async function* normalizedEvents(
  stream: AsyncIterable<unknown>,
  sink: { usage: { total_tokens?: number } | null; events: unknown[] },
): AsyncIterable<ResponsesEvent> {
  const completed = new Set<string>();
  for await (const raw of stream) {
    sink.events.push(raw);
    const event = raw as {
      type?: string;
      item_id?: unknown;
      output_index?: unknown;
      content_index?: unknown;
      part?: { type?: unknown; text?: unknown } | null;
      response?: { usage?: { total_tokens?: number } | null };
    };
    if (event.type === "response.completed") sink.usage = event.response?.usage ?? null;
    const lane = `${String(event.item_id)}:${String(event.output_index)}:${String(event.content_index)}`;
    if (event.type === "response.output_text.done") {
      if (!completed.has(lane)) {
        completed.add(lane);
        yield event as unknown as ResponsesEvent;
      }
      continue;
    }
    yield event as unknown as ResponsesEvent;
    if (
      event.type === "response.content_part.done" &&
      !completed.has(lane) &&
      event.part &&
      typeof event.part === "object" &&
      event.part.type === "output_text" &&
      typeof event.part.text === "string"
    ) {
      completed.add(lane);
      yield {
        type: "response.output_text.done",
        item_id: event.item_id,
        output_index: event.output_index,
        content_index: event.content_index,
        text: event.part.text,
      } as unknown as ResponsesEvent;
    }
  }
}

export function validateSegmentation(result: ImageSegmentationResult): void {
  if (result.outcome.status !== "completed") {
    throw new MetaApiError(`Segmentation was incomplete: ${JSON.stringify(result.outcome)}`, null, result.outcome);
  }
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new MetaApiError(
      `The parser rejected records: ${errors.map((d) => `line ${d.line}: ${d.message}`).join("; ")}`,
      null,
      errors,
    );
  }
}

export async function segmentImage(feature: string, image: Buffer, mime: string, concept: string) {
  const phrase = concept.trim();
  if (!phrase) throw new MetaApiError("The concept must be a short noun phrase.", null, null);
  const sink: { usage: { total_tokens?: number } | null; events: unknown[] } = { usage: null, events: [] };
  const result = await tracked(
    MODELS.segment,
    feature,
    async () => {
      const stream = await metaClient().responses.create({
        model: MODELS.segment,
        stream: true,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: phrase },
              { type: "input_image", image_url: dataUrl(image, mime) },
            ],
          },
        ] as unknown as OpenAI.Responses.ResponseInput,
      });
      const parsed = await parseImageStream(normalizedEvents(stream, sink)).finalResult;
      validateSegmentation(parsed);
      return parsed;
    },
    () => sink.usage?.total_tokens ?? null,
  );
  return { result, usage: sink.usage, events: sink.events };
}

/**
 * Builds a full-size 0/255 alpha channel from every mask record: each mask's
 * raster is scaled to its bounds and painted at its position.
 */
export async function maskToAlpha(
  result: ImageSegmentationResult,
  width: number,
  height: number,
  resize: (raster: Uint8Array, w: number, h: number, toW: number, toH: number) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const alpha = new Uint8Array(width * height);
  for (const record of recordsOfKind(result.records, "mask")) {
    const { left, top, right, bottom } = record.bounds;
    const boxW = Math.max(1, Math.round(right - left));
    const boxH = Math.max(1, Math.round(bottom - top));
    const raster = decodeMaskToRaster(record.mask);
    const scaled = await resize(raster, record.mask.width, record.mask.height, boxW, boxH);
    for (let y = 0; y < boxH; y++) {
      const py = Math.round(top) + y;
      if (py < 0 || py >= height) continue;
      for (let x = 0; x < boxW; x++) {
        const px = Math.round(left) + x;
        if (px < 0 || px >= width) continue;
        if (scaled[y * boxW + x]) alpha[py * width + px] = 255;
      }
    }
  }
  return alpha;
}

// ---- Muse Voice Transcribe: one-shot HTTP endpoint ----------------------------
// Cookbook: 06_muse_voice/01_voice_api_fundamentals/utils.py (transcribe_recording).
// Input must be a mono 16-bit WAV (README: ffmpeg -ac 1 -ar 24000 -sample_fmt s16).

export const TRANSCRIBE_URL = `${META_BASE_URL}/asr/transcribe`;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;

export type TranscribeResult = {
  sessionId?: string;
  transcript?: string;
  audioDurationMs?: number;
  turns?: Array<{ transcript?: string; startMs?: number; speaker?: string }>;
};

/** Full transcript text, from `transcript` or joined `turns`. */
export function transcriptText(result: TranscribeResult): string {
  if (result.transcript) return result.transcript;
  return (result.turns ?? []).map((t) => t.transcript ?? "").join(" ").trim();
}

export async function transcribe(
  feature: string,
  wavPath: string,
  options: { mode?: "PUSH_TO_TALK" | "ENDPOINTING" | "DIARIZATION"; keywords?: string[] } = {},
) {
  const audio = await readFile(wavPath);
  if (audio.length > MAX_AUDIO_BYTES) {
    throw new MetaApiError(`${wavPath} is over the 32 MB limit.`, null, null);
  }
  const request: Record<string, unknown> = {
    mode: options.mode ?? "PUSH_TO_TALK",
    model: MODELS.transcribe,
    audioEncoding: "WAV",
  };
  if (options.keywords?.length) request.keywords = options.keywords;

  return tracked(
    MODELS.transcribe,
    feature,
    async () => {
      const form = new FormData();
      form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
      form.append("audio", new Blob([audio]), path.basename(wavPath));
      const res = await fetch(TRANSCRIBE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${requireEnv("MODEL_API_KEY")}` },
        body: form,
        signal: AbortSignal.timeout(300_000),
      });
      const text = await res.text();
      if (!res.ok) throw new MetaApiError(`Transcribe failed with HTTP ${res.status}`, res.status, text);
      return JSON.parse(text) as TranscribeResult;
    },
    // The transcribe reply carries no token count; audio length is reported instead.
    () => null,
  );
}
