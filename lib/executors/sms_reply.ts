import { db } from "../db";
import { sendText } from "../frontdesk/store";
import type { Executor } from "./types";

// One fixed-template text to a caller (passed-on note, no-times note, reminder, help).
export const smsReply: Executor = async (approval) => {
  const { inquiry_id, to, body, booking_id } = approval.payload as Record<string, string>;
  if (!to || !body) throw new Error("payload needs to and body.");
  const out = await sendText({ to, body, inquiryId: inquiry_id ?? null, actor: "executor", action: "sms_reply_sent", approvalId: approval.id });
  if (inquiry_id) await db()`update practice_os.inquiries set ai_disclosed_at = coalesce(ai_disclosed_at, now()) where id = ${inquiry_id}`;
  if (booking_id) await db()`update practice_os.consult_bookings set reminder_sent_at = coalesce(reminder_sent_at, now()) where id = ${booking_id}`;
  return { texted: to, dryRun: out.dryRun };
};
