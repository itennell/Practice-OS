import { alertPhone } from "./crisis";

// The Front Desk test text (test-console.ts queues it, executors/sms_reply.ts
// sends it). Its own file so the executor doesn't pull in the whole pipeline.

export const TEST_TEXT =
  "Practice-OS test: this is your Front Desk. If you got this, texts from your practice line reach your phone. No reply needed.";

/** Where a test text goes when approved: her alert phone, whatever the payload says. */
export async function testTextRecipient(): Promise<string> {
  const to = await alertPhone();
  if (!to) throw new Error("No alert phone is set, so there is nowhere to send the test text.");
  return to;
}
