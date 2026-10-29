// Her post style, picked in onboarding from three [Sample] captions on the same
// topic (how to book). Muse writes the three from her own practice facts; plain code
// checks each one with the post critic, and anything odd (or no key) gives her the
// three fixed captions instead. The pick shapes every draft (lib/instagram/write.ts).
import { audit } from "../audit";
import { chat as metaChat } from "../meta";
import { codeCritic, type ChatFn } from "./critic";
import { FALLBACK_SAMPLES, STYLES, type StyleSample } from "./style-samples";
import type { PracticeFacts } from "./write";

export { FALLBACK_SAMPLES, STYLES, type StyleId, type StyleSample } from "./style-samples";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Muse took longer than ${ms / 1000}s`)), ms))]);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["warm", "plain", "professional"],
  properties: Object.fromEntries(
    STYLES.map((s) => [s.id, { type: "string", description: `${s.voice} 25 to 45 words about how to book a first visit. No hashtags.` }]),
  ),
};

/** A sample she may see: logistics only, short, and nothing the post critic would block. */
export function sampleOk(text: unknown, f: Pick<PracticeFacts, "fees">): text is string {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (t.length < 40 || t.length > 320) return false;
  const c = codeCritic(t, { licenseLine: "", feesCents: f.fees.map((x) => x.cents) });
  return c.findings.every((x) => x.rule === "license_line");
}

export async function writeStyleSamples(
  f: PracticeFacts,
  opts: { chat?: ChatFn; hasKey?: boolean; timeoutMs?: number } = {},
): Promise<{ samples: StyleSample[]; source: "muse" | "fallback" }> {
  const hasKey = opts.hasKey ?? Boolean(process.env.MODEL_API_KEY);
  if (!hasKey) return { samples: FALLBACK_SAMPLES, source: "fallback" };
  try {
    // She is waiting on the screen: past about 8 seconds she gets the fixed three.
    const res = await withTimeout((opts.chat ?? metaChat)("onboarding.style_samples", {
      messages: [
        {
          role: "user",
          content: [
            `Write three short Instagram captions for ${f.practiceName}, the private practice of ${f.clinicianName}, ${f.credential}. This is a fictional demo practice.`,
            "All three say the same thing: how to book a first visit (a free 15-minute call, then picking a time, booking link in the bio).",
            "Practice logistics only. No mental health advice, no coping tips, no client stories, no reviews, no promises of results, no prices.",
            "About a 6th-grade reading level. One caption per voice:",
            ...STYLES.map((s) => `- ${s.id}: ${s.voice}`),
          ].join("\n"),
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "style_samples", schema: SCHEMA as never } },
    }), opts.timeoutMs ?? 8_000);
    const parsed = JSON.parse(res.choices[0]?.message.content ?? "{}") as Record<string, unknown>;
    const samples = STYLES.map((s) => ({ id: s.id, label: s.label, text: parsed[s.id] }));
    if (!samples.every((s) => sampleOk(s.text, f))) return { samples: FALLBACK_SAMPLES, source: "fallback" };
    return { samples: samples.map((s) => ({ ...s, text: String(s.text).trim() })), source: "muse" };
  } catch (err) {
    await audit({ actor: "system", action: "style_samples_fallback", subjectType: "onboarding", details: { error: err instanceof Error ? err.message : String(err) } });
    return { samples: FALLBACK_SAMPLES, source: "fallback" };
  }
}
