// Feature switches. Plain constants, not env vars, so a change is one reviewable diff.

/**
 * Front Desk (practice phone line, voicemail, texts, Cal.com consult booking, website chat)
 * is paused: Isaiah took it off the board on 2026-11-02, so Practice-OS is three helpers
 * (Admin, Media, Referrals). While this is false the clinician never sees it: no menu row,
 * page, settings card, onboarding step, approval, count or Aeon tool. The code, tables and
 * Twilio/Instagram callback routes stay so it can come back.
 *
 * To turn it back on: set this to true. Nothing else needs to change.
 * The urgent crisis alert to her own cell (lib/safety.ts) works either way.
 */
export const FRONT_DESK_ENABLED = false;

/** Aeon tools that belong to Front Desk (lib/aeon/tools.ts, mcp/server.ts). */
export const FRONT_DESK_TOOLS: readonly string[] = ["front_desk_status", "front_desk_check_now", "offer_consult_times"];

/** Approval kinds that belong to Front Desk; hidden from every list and count while it is paused. */
export const FRONT_DESK_APPROVAL_KINDS: readonly string[] = [
  "sms_reply",
  "consult_booking",
  "consult_reschedule",
  "consult_cancel",
  "web_chat_reply",
  "text_consult_options",
];

/** Keeps a tool unless it is a Front Desk tool and Front Desk is off. */
export const toolEnabled = (name: string): boolean => FRONT_DESK_ENABLED || !FRONT_DESK_TOOLS.includes(name);
