// The Front Desk inbox: calls, voicemails and texts land once each (a repeat
// check adds nothing), a call that left a voicemail shows as one row, the
// safety result is kept, and caller numbers reach the page masked.
// Writes inquiries and messages, so it runs only on a local throwaway database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const url = process.env.DATABASE_URL ?? "";
const localDb = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

const { db, closeDb } = await import("../lib/db");
const { setFrontDeskDeps } = await import("../lib/frontdesk/deps");
const { checkFrontDesk } = await import("../lib/frontdesk/check");
const { frontDeskInbox, maskPhone, revealNumber } = await import("../lib/frontdesk/inbox");
const { safetyResult } = await import("../lib/frontdesk/ingest");
const { checkCrisis } = await import("../lib/safety");

const CALLER = "+13125550161";
const MISSED = "+13125550162";
const NOW = new Date("2026-11-02T16:00:00Z");
const tag = Date.now();
const sent: string[] = [];

const phone = {
  vendor: "twilio" as const,
  check: async () => ({ ok: true as const, label: "fake" }),
  listCalls: async () => [
    { id: `CA_vm_${tag}`, from: CALLER, receivedAt: new Date(NOW.getTime() - 60_000), seconds: 41, status: "completed" },
    { id: `CA_missed_${tag}`, from: MISSED, receivedAt: new Date(NOW.getTime() - 30_000), seconds: 0, status: "no-answer" },
  ],
  listVoicemails: async () => [
    {
      id: `RE_${tag}`,
      callId: `CA_vm_${tag}`,
      seconds: 33,
      from: CALLER,
      receivedAt: NOW,
      audio: async () => ({ bytes: Buffer.from("not a wav"), mime: "audio/mpeg" }),
      providerTranscript: "Hi, this is a question about whether you take Blue Cross. Call me back at 312 555 0161.",
    },
  ],
  listInboundTexts: async () => [{ id: `SM_${tag}`, from: MISSED, body: "Do you have evening hours?", receivedAt: NOW }],
  sendText: async (to: string) => {
    sent.push(to);
    return { id: `SM_out_${tag}_${sent.length}` };
  },
};
const calendar = {
  provider: "calcom" as const,
  check: async () => ({ ok: true as const, label: "fake" }),
  openSlots: async () => [],
  isFree: async () => true,
  book: async () => ({ externalId: "x" }),
  reschedule: async (id: string) => ({ externalId: id }),
  cancel: async () => {},
};

const saved = { DRY_RUN: process.env.DRY_RUN };

async function cleanup() {
  const phones = [CALLER, MISSED];
  await db()`delete from practice_os.approvals where payload ->> 'inquiry_id' in (select id::text from practice_os.inquiries where contact_phone in ${db()(phones)})`;
  await db()`delete from practice_os.alerts where inquiry_id in (select id from practice_os.inquiries where contact_phone in ${db()(phones)})`;
  await db()`delete from practice_os.inquiries where contact_phone in ${db()(phones)}`;
  await db()`delete from practice_os.front_desk_sync where vendor = 'twilio'`;
}

beforeAll(async () => {
  if (!localDb) return;
  process.env.DRY_RUN = "true";
  setFrontDeskDeps({ phone: async () => phone, calendar: async () => calendar, timeZone: async () => "America/Chicago", now: () => NOW });
  await cleanup();
});

afterAll(async () => {
  if (!localDb) return;
  setFrontDeskDeps(null);
  await cleanup();
  if (saved.DRY_RUN === undefined) delete process.env.DRY_RUN;
  else process.env.DRY_RUN = saved.DRY_RUN;
  await closeDb();
});

describe("masking and the safety result (plain code)", () => {
  it("shows only the last four digits", () => {
    expect(maskPhone("+13125550144")).toBe("(•••) •••-0144");
    expect(maskPhone(null)).toBe("Hidden number");
  });

  it("names the crisis category and the kinds of private detail, never the words", () => {
    expect(safetyResult("Call me at 312 555 0144", checkCrisis("Call me at 312 555 0144"))).toEqual({ crisis: null, private: ["contact"] });
    const urgent = safetyResult("I want to kill myself", checkCrisis("I want to kill myself"));
    expect(urgent.crisis).toBe("self_harm");
  });
});

describe.skipIf(!localDb)("Front Desk inbox (local database only)", () => {
  it("one check finds the calls, the voicemail and the text; a second check adds nothing", async () => {
    const first = await checkFrontDesk();
    expect(first.ran && first.error).toBeFalsy();
    expect(first).toMatchObject({ ran: true, calls: 2, voicemails: 1, texts: 1 });
    const second = await checkFrontDesk();
    expect(second).toMatchObject({ ran: true, calls: 0, voicemails: 0, texts: 0 });
    const [{ n }] = await db()`select count(*)::int as n from practice_os.messages where provider_sid like ${`%${tag}%`} and direction = 'inbound'`;
    expect(n).toBe(4);
  });

  it("the timeline shows a call that left a voicemail once, as the voicemail, with masked numbers", async () => {
    const items = (await frontDeskInbox("all")).filter((i) => i.caller.endsWith("0161") || i.caller.endsWith("0162"));
    const kinds = items.map((i) => i.kind).sort();
    expect(kinds).toContain("voicemail");
    expect(kinds.filter((k) => k === "call")).toHaveLength(1); // the missed one only
    const vm = items.find((i) => i.kind === "voicemail")!;
    expect(vm).toMatchObject({ caller: "(•••) •••-0161", seconds: 33, playable: true });
    expect(vm.safety).toEqual({ crisis: null, private: ["contact"] });
    expect(JSON.stringify(items)).not.toContain("+13125550161");
  });

  it("filters by kind", async () => {
    expect((await frontDeskInbox("calls")).every((i) => i.kind === "call")).toBe(true);
    expect((await frontDeskInbox("texts")).every((i) => i.kind === "text_in" || i.kind === "text_out")).toBe(true);
  });

  it("reveals the full number for one row", async () => {
    const vm = (await frontDeskInbox("voicemails")).find((i) => i.caller.endsWith("0161"))!;
    expect(await revealNumber(vm.id)).toBe("(312) 555-0161");
  });
});
