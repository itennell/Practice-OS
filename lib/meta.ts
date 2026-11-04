// The only client for the Meta model API (AGENTS.md > Architecture).
// Request shapes are copied from meta-models/meta-model-cookbook at commit
// 0a99b987858ec4e49c04fc3f114bf33851e81deb; each function names its source.
import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { requireEnv } from "./env";
import { logModelCall } from "./model-calls";

export const META_BASE_URL = "https://api.meta.ai/v1";

export const MODELS = {
  chat: "muse-spark-1.3",
  image: "muse-image-1.0",
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

// ---- Muse Spark: search grounding (Responses API) ---------------------------
// Cookbook: 01_api_fundamentals/10_search_grounding.ipynb (cells 4, 6, 10, 12).
// `include: ["web_search_call.results"]` and `user_location` come from Meta's
// search grounding guide (dev.meta.ai/docs/search-grounding), not the notebook.

export type SearchSource = { url: string; title: string; snippet: string };
export type SearchCitation = { url: string; title: string; passage: string };
export type GroundedAnswer = {
  text: string;
  /** False when the model answered without searching (the cookbook: never assume a search ran). */
  searched: boolean;
  /** Every page the search read, with the text the model saw. */
  sources: SearchSource[];
  /** The subset of sources the answer cites, with the passage each one backs. */
  citations: SearchCitation[];
  tokens: number | null;
};

export type SearchOptions = {
  /** low: single facts; medium: the default; high: broad questions. */
  context?: "low" | "medium" | "high";
  /** How hard Muse reasons (Responses API `reasoning.effort`); low keeps research cheaper. */
  effort?: "low" | "medium" | "high";
  location?: { country?: string; region?: string; city?: string; timezone?: string };
};

type GroundedResponse = {
  output?: Array<{
    type: string;
    results?: Array<{ type?: string; url?: string; title?: string; snippet?: string }> | null;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{ type: string; url?: string; title?: string; start_index?: number; end_index?: number }> | null;
    }>;
  }>;
  usage?: { total_tokens?: number } | null;
};

/** Reads a search-grounded response by item type, never by position (cookbook cell 3). */
export function readGrounded(response: GroundedResponse): GroundedAnswer {
  const output = response.output ?? [];
  const searches = output.filter((o) => o.type === "web_search_call");
  const sources = searches.flatMap((s) =>
    (s.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({ url: r.url as string, title: r.title ?? "", snippet: r.snippet ?? "" })),
  );
  const blocks = output.filter((o) => o.type === "message").flatMap((m) => m.content ?? []).filter((b) => b.type === "output_text");
  const citations = blocks.flatMap((b) =>
    (b.annotations ?? [])
      .filter((a) => a.type === "url_citation" && a.url)
      .map((a) => ({
        url: a.url as string,
        title: a.title ?? "",
        passage: (b.text ?? "").slice(a.start_index ?? 0, a.end_index ?? 0),
      })),
  );
  return {
    text: blocks.map((b) => b.text ?? "").join(""),
    searched: searches.length > 0,
    sources,
    citations,
    tokens: response.usage?.total_tokens ?? null,
  };
}

/** One question answered from the live web, with every source's URL and snippet. */
export async function searchGrounded(feature: string, input: string, opts: SearchOptions = {}) {
  const tool = {
    type: "web_search",
    ...(opts.context ? { search_context_size: opts.context } : {}),
    ...(opts.location ? { user_location: { type: "approximate", ...opts.location } } : {}),
  };
  const response = await tracked(
    MODELS.chat,
    feature,
    () =>
      // The SDK's types predate Meta's web_search tool and results include; the shape is Meta's.
      metaClient().responses.create({
        model: MODELS.chat,
        input,
        tools: [tool],
        include: ["web_search_call.results"],
        ...(opts.effort ? { reasoning: { effort: opts.effort } } : {}),
      } as never) as unknown as Promise<GroundedResponse>,
    (r) => r.usage?.total_tokens ?? null,
  );
  return { response, answer: readGrounded(response) };
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
  return transcribeBytes(feature, audio, path.basename(wavPath), options);
}

/**
 * The same call from bytes in memory, so audio that must never touch the disk
 * (a coffee debrief, lib/referrals/debrief.ts) is sent straight from the request.
 */
export async function transcribeBytes(
  feature: string,
  audio: Buffer,
  filename = "audio.wav",
  options: { mode?: "PUSH_TO_TALK" | "ENDPOINTING" | "DIARIZATION"; keywords?: string[] } = {},
) {
  if (audio.length > MAX_AUDIO_BYTES) {
    throw new MetaApiError(`${filename} is over the 32 MB limit.`, null, null);
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
      form.append("audio", new Blob([new Uint8Array(audio)]), filename);
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
