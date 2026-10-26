import { db } from "./db";

// One row per model call in practice_os.model_calls.
export type ModelCall = {
  model: string;
  feature: string;
  tokens: number | null;
  ms: number;
  ok: boolean;
};

// Writes go to stderr only: stdout belongs to the MCP stdio protocol.
// A failed log write never fails the model call itself.
export async function logModelCall(call: ModelCall): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(`[model_calls] not saved (no DATABASE_URL) ${JSON.stringify(call)}`);
    return;
  }
  try {
    await db()`
      insert into practice_os.model_calls (model, feature, tokens, ms, ok)
      values (${call.model}, ${call.feature}, ${call.tokens}, ${call.ms}, ${call.ok})
    `;
    console.error(`[model_calls] saved ${JSON.stringify(call)}`);
  } catch (err) {
    console.error(`[model_calls] save failed: ${err instanceof Error ? err.message : String(err)} ${JSON.stringify(call)}`);
  }
}
