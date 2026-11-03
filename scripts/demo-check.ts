import { checkDemo, checkRefusal } from "../lib/demo-check";
import { loadEnv } from "../lib/env";
import { prepareDatabase } from "../lib/local-db";

// npm run demo:check: is the running database ready for the Referrals demo recording?
// Reads only (lib/demo-check.ts). Exits 1 when any line FAILs.
loadEnv();

const { url } = await prepareDatabase();
const refusal = checkRefusal(url, process.env.SUPABASE_PROJECT_REF);
if (refusal) {
  console.error(refusal);
  process.exit(1);
}

const lines = await checkDemo({ url });
for (const l of lines) console.log(`${l.status.padEnd(4)}  ${l.text}`);
const failed = lines.filter((l) => l.status === "FAIL").length;
const warned = lines.filter((l) => l.status === "WARN").length;
console.log(failed ? `\nNot ready: ${failed} to fix before recording.` : warned ? `\nReady, with ${warned} to look at.` : "\nReady to record.");
process.exit(failed ? 1 : 0);
