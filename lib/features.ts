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

/** Keeps a tool unless it is a Front Desk tool and Front Desk is off, or the referrals-only demo is on and it isn't on its list. */
export const toolEnabled = (name: string): boolean =>
  (FRONT_DESK_ENABLED || !FRONT_DESK_TOOLS.includes(name)) && (!REFERRALS_ONLY_DEMO || REFERRAL_DEMO_TOOLS.includes(name));

/**
 * Referrals-only demo (hackathon demo, Wed 2026-11-04): the app leads with the Referrals helper
 * alone. While true the clinician sees only Home chat, Referrals, Approvals, Files, Memory and
 * Settings; Admin and Media (Instagram, Grow, website) are hidden and their pages go to Home;
 * Aeon gets only REFERRAL_DEMO_TOOLS; approvals and Files show only referral items (and her own
 * uploads); onboarding takes the short referrals path. No data is touched.
 *
 * Set this to false to restore the full app exactly as it was. Nothing else needs to change.
 */
export const REFERRALS_ONLY_DEMO = true;

/**
 * The one allow-list of Aeon tools (chat and MCP) while REFERRALS_ONLY_DEMO is on: the referral
 * tools plus the core ones (status, memory, documents, approvals). Later PRs (debrief, discovery)
 * add their tool names here.
 */
export const REFERRAL_DEMO_TOOLS: readonly string[] = [
  // core
  "status",
  "queue_approval",
  "remember",
  "recent_memory_changes",
  "forget",
  "find_documents",
  "open_document",
  "read_document",
  "file_upload",
  // referrals
  "find_referral_sources",
  "list_referral_sources",
  "move_referral_source",
  "draft_outreach",
  "referral_outreach_plan",
  "log_referral_contact",
  "recheck_referral_source",
  "set_referral_email",
  "find_referral_cards",
  "set_do_not_contact",
  "revise_referral_letter",
  // discovery: organisations she adds by hand (find_referral_sources also finds CMS and OpenStreetMap places)
  "add_referral_source",
  // coming: the debrief PR adds this tool; listed now so it works once merged
  "debrief_meeting",
];

/**
 * Approval kinds the demo shows: what the referral tools queue, and file_document (file_upload's
 * "keep this file" approval: her uploads are hers). aeon_action counts too when it wraps one of REFERRAL_DEMO_TOOLS.
 */
export const REFERRAL_DEMO_APPROVAL_KINDS: readonly string[] = ["referral_letter", "file_document"];

/** Files page and document index kinds shown in the demo: her own uploads and referral letters. */
export const REFERRAL_DEMO_FILE_KINDS: readonly string[] = ["uploaded", "referral_letter"];

/** Pages hidden in the demo (and everything under them); proxy.ts sends them to Home. */
export const REFERRAL_DEMO_HIDDEN_PAGES: readonly string[] = ["/admin", "/media", "/instagram", "/grow", "/front-desk"];

/** Onboarding screens in the demo's short path, in order of QUESTIONS (lib/onboarding/chapters.ts). */
export const REFERRAL_DEMO_SCREENS: readonly string[] = [
  "name",
  "muse-key",
  "practice_name",
  "state",
  "license",
  // her work contact and office: letters need them for the reply line and the distance
  "contact",
  "office",
  "who",
  "referrals:home_zip",
  // who she'd like to hear from; the niche picker replaces it in a later PR
  "referrals:specialties",
  "employer_policy",
];

/**
 * API routes of the hidden helpers: 404 in the demo (proxy.ts), so even the Vercel copy can't
 * read their data. Crisis-seen, approvals, documents, referrals, chat, memories and settings stay.
 */
export const REFERRAL_DEMO_HIDDEN_API: readonly string[] = [
  "/api/gfe",
  "/api/superbills",
  "/api/instagram",
  "/api/growth",
  "/api/client-forms",
  "/api/studio",
  "/api/payers",
  "/api/credentialing",
  "/api/media",
  "/api/release-forms",
  "/api/obligations",
];

/** An API route of a hidden helper while the demo is on. */
export const hiddenApiInDemo = (pathname: string): boolean =>
  REFERRALS_ONLY_DEMO && REFERRAL_DEMO_HIDDEN_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** A page path the demo hides (never an API route). */
export const hiddenInDemo = (pathname: string): boolean =>
  REFERRALS_ONLY_DEMO && REFERRAL_DEMO_HIDDEN_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** An approval kind the referrals-only demo keeps (every kind while it is off). Front Desk's own pause is checked where it always was. */
export const demoApprovalKind = (kind: string): boolean => !REFERRALS_ONLY_DEMO || REFERRAL_DEMO_APPROVAL_KINDS.includes(kind);

/** A document or file kind shown on Files and to Aeon's document tools. */
export const fileKindEnabled = (kind: string): boolean => !REFERRALS_ONLY_DEMO || REFERRAL_DEMO_FILE_KINDS.includes(kind);

/** Whether the referrals-only demo shows an approval. `tool` is an aeon_action's payload.tool: only one wrapping a referral tool shows. */
export const demoApprovalShown = (kind: string, tool?: unknown): boolean =>
  kind === "aeon_action" ? !REFERRALS_ONLY_DEMO || (typeof tool === "string" && REFERRAL_DEMO_TOOLS.includes(tool)) : demoApprovalKind(kind);
