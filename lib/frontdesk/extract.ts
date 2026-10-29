import { chat } from "../meta";
import { toE164 } from "./phone/numbers";

// muse-spark-1.3 pulls the caller's name, callback number and what they want
// out of a voicemail transcript. It only runs after checkCrisis() found nothing.
// Plain code checks the result: a number must parse as a US number, a name must
// look like a name, and the intent must be one we handle; anything else falls back.
// Cookbook: 01_api_fundamentals/04_structured_output.ipynb (response_format json_schema).

export type Intent = "book" | "reschedule" | "cancel" | "question" | "other";
export type Extracted = { name: string | null; callbackNumber: string | null; intent: Intent; summary: string };

export const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "callback_number", "intent", "summary"],
  properties: {
    name: { type: ["string", "null"], description: "The caller's first name as they said it, or null." },
    callback_number: { type: ["string", "null"], description: "A phone number the caller said to call back, digits only, or null." },
    intent: { type: "string", enum: ["book", "reschedule", "cancel", "question", "other"] },
    summary: { type: "string", description: "One short logistics-only line, at most 12 words, no feelings or health details." },
  },
} as const;

const SYSTEM = [
  "You read voicemails and texts left for a private therapy practice's front desk. You only handle logistics.",
  "Return JSON with: the caller's first name if they said it; a callback number only if they spoke one;",
  "intent: book (wants a first consult or appointment), reschedule, cancel, question (asks about fees, insurance, hours, location or similar), or other;",
  "summary: one short logistics-only line. Never describe feelings, symptoms, diagnoses or reasons for therapy.",
].join(" ");

const INTENTS: Intent[] = ["book", "reschedule", "cancel", "question", "other"];

/** Plain-code check of the model's JSON. */
export function vetExtraction(raw: unknown, callerId: string | null): Extracted {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof o.name === "string" && /^[A-Za-z][A-Za-z' -]{0,29}$/.test(o.name.trim()) ? o.name.trim().split(" ")[0] : null;
  const spoken = typeof o.callback_number === "string" ? toE164(o.callback_number) : null;
  const intent = INTENTS.includes(o.intent as Intent) ? (o.intent as Intent) : "other";
  const summary = typeof o.summary === "string" ? o.summary.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  return { name, callbackNumber: spoken ?? callerId, intent, summary: summary || "Voicemail" };
}

export async function extractVoicemail(transcript: string, callerId: string | null): Promise<Extracted> {
  const res = await chat("front_desk.extract", {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: transcript.slice(0, 4000) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "voicemail", schema: EXTRACT_SCHEMA as never } },
  });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(res.choices[0]?.message.content ?? "null");
  } catch {
    parsed = null;
  }
  return vetExtraction(parsed, callerId);
}
