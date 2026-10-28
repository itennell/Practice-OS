// npx tsx scripts/seed-chat.ts <scenario>: saves one of Aeon's recorded golden
// conversations (tests/fixtures/aeon-chat/<scenario>.json) into the database by
// replaying the recorded model replies. No model call. Tools run for real.
// Prints the id of the last conversation it saved. Used by the Playwright tests.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../lib/env";

loadEnv();
// No DATABASE_URL: use (and if needed start) the built-in database, with its encryption key.
const { prepareDatabase } = await import("../lib/local-db");
await prepareDatabase();
const { sendMessage } = await import("../lib/aeon/chat");
const { closeDb } = await import("../lib/db");
const { SCENARIOS } = await import("../tests/fixtures/aeon-scenarios");

const name = process.argv[2];
const scenario = SCENARIOS.find((s) => s.name === name);
if (!scenario) {
  console.error(`Unknown scenario "${name}". One of: ${SCENARIOS.map((s) => s.name).join(", ")}`);
  process.exit(1);
}
const recorded = JSON.parse(await readFile(path.join(process.cwd(), "tests", "fixtures", "aeon-chat", `${name}.json`), "utf8")) as {
  calls: { response: unknown }[];
};
const queue = recorded.calls.map((c) => c.response);
const chat = (async () => {
  const next = queue.shift();
  if (!next) throw new Error("Ran out of recorded replies.");
  return next;
}) as never;

let last: string | null = null;
for (const turns of scenario.conversations) {
  let conversationId: string | null = null;
  for (const text of turns) conversationId = (await sendMessage({ conversationId, text, chat })).conversationId;
  last = conversationId;
}
console.log(last);
await closeDb();
