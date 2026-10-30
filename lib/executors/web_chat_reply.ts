import { audit } from "../audit";
import { db } from "../db";
import { addMessage } from "../frontdesk/store";
import type { Executor } from "./types";

// One reply in the practice website chat (consult times, or her own words).
// The visitor's page reads it from our own database, so nothing leaves the
// app: it runs the same with or without DRY_RUN, like test_note.
export const webChatReply: Executor = async (approval) => {
  const { inquiry_id, body } = approval.payload as Record<string, string>;
  if (!inquiry_id || !body) throw new Error("payload needs inquiry_id and body.");
  const [inq] = await db()`select 1 from practice_os.inquiries where id = ${inquiry_id} and channel = 'web_chat'`;
  if (!inq) throw new Error("That website chat no longer exists.");
  await addMessage({ inquiryId: inquiry_id, direction: "outbound", channel: "web_chat", body, vendor: "web", providerId: null });
  await db()`update practice_os.inquiries set status = 'options_sent', updated_at = now() where id = ${inquiry_id} and status <> 'needs_clinician'`;
  await audit({ actor: "executor", action: "web_chat_reply_shown", approvalId: approval.id, subjectType: "inquiry", subjectId: inquiry_id, details: { chars: body.length } });
  return { shown: "website chat" };
};
