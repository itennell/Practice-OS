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

/**
 * Urgent crisis alerts texted to her own cell. Off with Front Desk (Isaiah, 2026-11-02: no phone
 * work for now). While false there is no phone card, alert-number setting or onboarding question;
 * when the chat's crisis check fires, Aeon still shows the fixed 988/911 message and puts an
 * urgent item at the top of Admin, but texts no one. Set to true to bring the texted alert back.
 */
export const PHONE_ALERTS_ENABLED = false;

/** Any phone line at all: Front Desk's practice line or the urgent-alert line. */
export const PHONE_ENABLED = FRONT_DESK_ENABLED || PHONE_ALERTS_ENABLED;

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
