import OpenAI from "openai";
import { audit } from "../audit";
import { deleteConnection, getConnection, saveConnection } from "../connections";
import { META_BASE_URL, MODELS } from "../meta";
import { logModelCall } from "../model-calls";

// Her own Meta Muse key (desktop plan: each clinician brings her own). A key
// in .env (MODEL_API_KEY) wins, for developers; otherwise the key she pasted
// in onboarding or Settings › Connections is kept encrypted in connections
// ('muse') and copied into this process's MODEL_API_KEY, which lib/meta.ts reads.

export type MuseKeyCheck = { ok: true } | { ok: false; reason: "rejected" | "unreachable" };

/** One tiny chat call with the key (cookbook 01_api_fundamentals/01_chat_completions shape). */
export async function checkMuseKey(key: string): Promise<MuseKeyCheck> {
  const client = new OpenAI({ baseURL: META_BASE_URL, apiKey: key, maxRetries: 0, timeout: 20_000 });
  const started = Date.now();
  try {
    const r = await client.chat.completions.create({ model: MODELS.chat, messages: [{ role: "user", content: "Reply with the word OK." }] });
    await logModelCall({ model: MODELS.chat, feature: "muse_key_check", tokens: r.usage?.total_tokens ?? null, ms: Date.now() - started, ok: true });
    return { ok: true };
  } catch (err) {
    await logModelCall({ model: MODELS.chat, feature: "muse_key_check", tokens: null, ms: Date.now() - started, ok: false });
    const status = err instanceof OpenAI.APIError ? err.status : undefined;
    return { ok: false, reason: status === 401 || status === 403 ? "rejected" : "unreachable" };
  }
}

export async function saveMuseKey(key: string): Promise<void> {
  await saveConnection({ provider: "muse", accountLabel: `Key ending ${key.slice(-4)}`, accessToken: key, refreshToken: null, scopes: [], expiresAt: null, meta: {} });
  process.env.MODEL_API_KEY = key;
  await audit({ actor: "clinician", action: "connect", subjectType: "connection", subjectId: "muse" });
}

export async function removeMuseKey(): Promise<void> {
  await deleteConnection("muse");
  await audit({ actor: "clinician", action: "disconnect", subjectType: "connection", subjectId: "muse" });
}

/** At start: if .env has no MODEL_API_KEY, use the one she saved. */
export async function loadMuseKey(): Promise<void> {
  if (process.env.MODEL_API_KEY) return;
  const saved = await getConnection("muse").catch(() => null);
  if (saved?.accessToken) process.env.MODEL_API_KEY = saved.accessToken;
}
