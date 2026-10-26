// One row per model call. Same fields as the practice_os.model_calls table.
export type ModelCall = {
  model: string;
  feature: string;
  tokens: number | null;
  ms: number;
  ok: boolean;
};

// TODO: once practice_os.model_calls exists, INSERT the row here instead.
export async function logModelCall(call: ModelCall): Promise<void> {
  console.log(`[model_calls] ${JSON.stringify(call)}`);
}
