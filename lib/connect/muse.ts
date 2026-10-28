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

// Where this process's MODEL_API_KEY came from. "connections" means we copied the saved key in;
// anything else set in MODEL_API_KEY came from .env (or the shell) and always wins.
const SOURCE = "MODEL_API_KEY_SOURCE";
const fromEnvFile = () => Boolean(process.env.MODEL_API_KEY) && process.env[SOURCE] !== "connections";

function useSavedKey(key: string | null) {
  if (fromEnvFile()) return;
  if (key) {
    process.env.MODEL_API_KEY = key;
    process.env[SOURCE] = "connections";
  } else {
    delete process.env.MODEL_API_KEY;
    delete process.env[SOURCE];
  }
}

/** Saves her key. Returns false when a .env key is set, which keeps winning until it's removed from .env. */
export async function saveMuseKey(key: string): Promise<{ inUse: boolean }> {
  await saveConnection({ provider: "muse", accountLabel: `Key ending ${key.slice(-4)}`, accessToken: key, refreshToken: null, scopes: [], expiresAt: null, meta: {} });
  useSavedKey(key);
  await audit({ actor: "clinician", action: "connect", subjectType: "connection", subjectId: "muse" });
  return { inUse: !fromEnvFile() };
}

/** Forgets her key, in this process at once (other processes on their next loadMuseKey). */
export async function removeMuseKey(): Promise<void> {
  await deleteConnection("muse");
  useSavedKey(null);
  await audit({ actor: "clinician", action: "disconnect", subjectType: "connection", subjectId: "muse" });
}

/**
 * Copies the saved key into MODEL_API_KEY unless .env set one. Cheap enough to
 * call before each piece of work in a long-running process (the MCP server),
 * so a key replaced or removed in the app takes effect there too.
 */
export async function loadMuseKey(): Promise<void> {
  if (fromEnvFile()) return;
  const saved = await getConnection("muse").catch(() => undefined);
  if (saved === undefined) return; // database unreachable: keep what we have
  useSavedKey(saved?.accessToken ?? null);
}
