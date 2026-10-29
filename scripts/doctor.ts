// npm run doctor: checks each piece of setup and says, in plain words, what is
// done and what is next. `npm run doctor -- --json` prints the same checks as
// JSON for an AI agent. Read-only: it starts nothing and prints no key values.
import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../lib/env";
import { builtInDatabaseUrl } from "../lib/local-db-url";
import { modelCacheDir, NER_MODEL } from "../lib/aeon/phi-classifier";
import {
  calcomCheck,
  databaseCheck,
  dryRunCheck,
  envFileCheck,
  exitCode,
  formatReport,
  museCheck,
  nodeCheck,
  phoneCheck,
  privacyModelCheck,
  type ConnectFacts,
  type DatabaseFacts,
  type SetupCheck,
} from "../lib/setup/doctor";

const root = process.cwd();
const hasEnvFile = existsSync(path.join(root, ".env"));
loadEnv(root);

// MODEL_API_KEY from .env, read before anything copies a saved key into it.
const museFromEnv = Boolean(process.env.MODEL_API_KEY);

async function gather(): Promise<SetupCheck[]> {
  const kind: DatabaseFacts["kind"] = process.env.DATABASE_URL ? "supabase" : "built-in";
  const url = process.env.DATABASE_URL || builtInDatabaseUrl();
  let reachable = false;
  let status: (provider: string) => Promise<ConnectFacts> = async () => null;
  if (url) {
    process.env.DATABASE_URL = url;
    const { db } = await import("../lib/db");
    reachable = await db()`select 1`.then(() => true, () => false);
    if (reachable) {
      const { getConnectionStatus } = await import("../lib/connect/status");
      status = (p) => getConnectionStatus(p).catch(() => null);
    }
  }
  const model = existsSync(path.join(modelCacheDir(), NER_MODEL, "onnx", "model_quantized.onnx"));
  const checks = [
    nodeCheck(process.version),
    envFileCheck(hasEnvFile),
    databaseCheck({ kind, reachable }),
    privacyModelCheck(model),
    museCheck(museFromEnv, await status("muse")),
    calcomCheck(await status("calcom")),
    phoneCheck(reachable ? await status("phone") : null),
    dryRunCheck(process.env.DRY_RUN !== "false"),
  ];
  if (reachable) await (await import("../lib/db")).closeDb();
  return checks;
}

const checks = await gather();
console.log(process.argv.includes("--json") ? JSON.stringify({ checks, ready: exitCode(checks) === 0 }, null, 2) : formatReport(checks));
process.exit(exitCode(checks));
