// The pt-builder e2e "A fresh Aeon chat starts the same interview", one level down: the
// recorded chat (tests/fixtures/aeon-chat/pt-profile.json) is replayed through sendMessage
// against the test database, and her chat answers must land in the interview. The recording
// confirms her name with answer "true" (a string), which the own-words gate used to refuse,
// stalling the interview on its first question. Only the PHI guard is stubbed: its local
// name-finder needs a one-time download that sandboxed runs can't make.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: vi.fn(async (text: string) => ({ ok: true, text })) }));

const { sendMessage } = await import("../lib/aeon/chat");
const { loadMediaFacts } = await import("../lib/media/facts");
const { interviewState } = await import("../lib/media/pt-profile");
const { closeDb, db } = await import("../lib/db");
const { SCENARIOS } = await import("./fixtures/aeon-scenarios");

let saved: unknown;
const conversations: string[] = [];

beforeAll(async () => {
  [{ a: saved }] = await db()<{ a: unknown }[]>`select onboarding_answers as a from practice_os.clinician_profile limit 1`;
  await db()`update practice_os.clinician_profile set onboarding_answers = onboarding_answers #- '{media,pt}'`;
});

afterAll(async () => {
  await db()`update practice_os.clinician_profile set onboarding_answers = ${db().json(saved as never)}`;
  if (conversations.length) await db()`delete from practice_os.conversations where id in ${db()(conversations)}`;
  await closeDb();
});

describe("a fresh Aeon chat starts the Psychology Today interview", () => {
  it("her chat answers fill the interview, which picks up at 'How do you like to work?'", async () => {
    const recorded = JSON.parse(await readFile(path.join(process.cwd(), "tests", "fixtures", "aeon-chat", "pt-profile.json"), "utf8")) as { calls: { response: unknown }[] };
    const queue = recorded.calls.map((c) => c.response);
    const chat = (async () => queue.shift()) as never;
    const scenario = SCENARIOS.find((s) => s.name === "pt-profile")!;
    let id: string | null = null;
    let last = "";
    for (const text of scenario.conversations[0]) {
      const r = await sendMessage({ conversationId: id, text, chat });
      id = r.conversationId;
      last = JSON.stringify(r);
    }
    conversations.push(id!);
    expect(last).toMatch(/how do you like to work/i);
    const f = await loadMediaFacts();
    expect(interviewState(f).step?.id).toBe("approach");
    expect(f.answers.focus).toMatch(/anxiety, big life changes, and couples who feel stuck/i);
    expect(f.pt.seen).toContain("header");
  });
});
