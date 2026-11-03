import { CHECK_TIMEOUT_MS, checkDemo, checkRefusal, checkTimeoutMessage, type CheckLine } from "../lib/demo-check";
import { loadEnv } from "../lib/env";
import { prepareDatabase } from "../lib/local-db";

// npm run demo:check: is the running database ready for the Referrals demo recording?
// Reads only (lib/demo-check.ts). Exits 1 when any line FAILs, or when the database
// hasn't answered within CHECK_TIMEOUT_MS (it never waits forever).
loadEnv();

const started = Date.now();
// The backstop for everything, starting the database included.
setTimeout(() => {
  console.error(checkTimeoutMessage());
  process.exit(1);
}, CHECK_TIMEOUT_MS).unref();

let lines: CheckLine[];
try {
  const { url } = await prepareDatabase();
  const refusal = checkRefusal(url, process.env.SUPABASE_PROJECT_REF);
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
  lines = await checkDemo({ url, timeoutMs: Math.max(1_000, CHECK_TIMEOUT_MS - (Date.now() - started)) });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
for (const l of lines) console.log(`${l.status.padEnd(4)}  ${l.text}`);
const failed = lines.filter((l) => l.status === "FAIL").length;
const warned = lines.filter((l) => l.status === "WARN").length;
console.log(failed ? `\nNot ready: ${failed} to fix before recording.` : warned ? `\nReady, with ${warned} to look at.` : "\nReady to record.");
process.exit(failed ? 1 : 0);
