import { mkdir, writeFile } from "node:fs/promises";
import { loadEnv } from "../lib/env";
import { CREDENTIALS, type Credential } from "../lib/compliance/types";

// `npm run research -- CA LCSW [topic ...] [--save]`
// Runs Muse's state research live and prints what passed and what was dropped.
// --save writes the raw replies to tests/fixtures/research/ for offline tests.
// --reuse-search reruns only the cheap conversion step on a saved search (no new web search).
// Nothing is saved to the database; the app queues results for approval.
loadEnv();

const { TOPICS, extractDrafts, researchTopic, vetDrafts } = await import("../lib/compliance/research");
const { readGrounded } = await import("../lib/meta");
const { readFile } = await import("node:fs/promises");
const { todayIn } = await import("../lib/compliance/dates");
const { closeDb } = await import("../lib/db");
const { CREDENTIAL_LABEL: LABEL, STATES } = await import("../lib/compliance/states");

const args = process.argv.slice(2);
const save = args.includes("--save");
const reuse = args.includes("--reuse-search");
const [state, credential, ...rest] = args.filter((a) => !a.startsWith("--"));
if (!state || !STATES[state] || !CREDENTIALS.includes(credential as Credential)) {
  console.error(`Usage: npm run research -- <STATE> <${CREDENTIALS.join("|")}> [topic ...] [--save]`);
  console.error(`Topics: ${TOPICS.map((t) => t.id).join(", ")}`);
  process.exit(1);
}
const topics = rest.length ? TOPICS.filter((t) => rest.includes(t.id)) : TOPICS;
const ctx = { state, stateName: STATES[state], credential: credential as Credential, credentialLabel: LABEL[credential as Credential], today: todayIn() };

// Same as scripts/smoke.ts: stable placeholders so fixtures carry no account-specific ids.
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) =>
        /^(id|item_id|response_id|previous_response_id|system_fingerprint)$/.test(k) && typeof v === "string" ? [k, `redacted-${k}`] : [k, sanitize(v)],
      ),
    );
  }
  return value;
}

let tokens = 0;
let calls = 0;
for (const topic of topics) {
  console.log(`\n=== ${topic.label} (${state} ${credential})`);
  const file = `tests/fixtures/research/${state.toLowerCase()}_${credential.toLowerCase()}_${topic.id}.json`;
  const saveRaw = async (raw: { search: unknown; extraction: unknown }) => {
    await mkdir("tests/fixtures/research", { recursive: true });
    await writeFile(file, `${JSON.stringify(sanitize({ ctx, topic: topic.id, ...raw }), null, 2)}\n`);
  };
  const r = reuse
    ? await (async () => {
        const saved = JSON.parse(await readFile(file, "utf8"));
        const answer = readGrounded(saved.search);
        const extraction = await extractDrafts(ctx, topic, answer);
        if (save) await saveRaw({ search: saved.search, extraction });
        const drafts = JSON.parse(extraction.choices[0]?.message.content ?? '{"rules":[],"not_found":[]}');
        const vetted = await vetDrafts(drafts, answer, ctx, topic);
        return { ...vetted, not_found: drafts.not_found as string[], tokens: extraction.usage?.total_tokens ?? 0, calls: 1 };
      })()
    : await researchTopic(ctx, topic, { onRaw: save ? saveRaw : undefined });
  tokens += r.tokens;
  calls += r.calls;
  for (const rule of r.rules) {
    console.log(`KEEP  ${rule.title}  [${rule.source.evidence}]`);
    console.log(`      ${rule.schedule.type} ${JSON.stringify(rule.schedule)}`);
    console.log(`      "${rule.source.quote}"  ${rule.source.url}`);
  }
  for (const d of r.dropped) console.log(`DROP  ${d.title}: ${d.reasons.join("; ")}`);
  for (const n of r.not_found) console.log(`NOT FOUND  ${n}`);
  for (const p of r.page_checks) console.log(`page  ${p.rule_id}: ${p.result} (${p.detail})`);
  console.log(`tokens ${r.tokens}`);
}
console.log(`\nTotal: ${calls} calls, ${tokens} tokens.`);
// model_calls logging opens the database pool; close it or Node waits on it forever.
await closeDb();
