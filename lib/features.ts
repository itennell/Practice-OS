// Feature switches. Plain constants, not env vars, so a change is one reviewable diff.

/** Keeps a tool unless the referrals-only demo is on and it isn't on its list. */
export const toolEnabled = (name: string): boolean => !REFERRALS_ONLY_DEMO || REFERRAL_DEMO_TOOLS.includes(name);

/**
 * Referrals-only demo: the app leads with the Referrals helper alone. Off since 2026-11-04
 * (Isaiah: the demo shows Admin and Referrals). While true the clinician sees only Home chat, Referrals, Approvals, Files, Memory and
 * Settings; Admin is hidden and its pages go to Home;
 * Aeon gets only REFERRAL_DEMO_TOOLS; approvals and Files show only referral items (and her own
 * uploads); onboarding takes the short referrals path. No data is touched.
 *
 * Set this to true for the referrals-only path; false is the full app. Nothing else needs to change.
 */
export const REFERRALS_ONLY_DEMO = false;

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
  "log_referral_out",
  "recheck_referral_source",
  "set_referral_email",
  "find_referral_cards",
  "set_do_not_contact",
  "revise_referral_letter",
  // discovery: organisations she adds by hand (find_referral_sources also finds CMS and OpenStreetMap places)
  "add_referral_source",
  "set_referral_niche",
  // coming: the debrief PR adds this tool; listed now so it works once merged
  "debrief_meeting",
  // the Referrals calendar: Aeon proposes a time and queues a referral_meeting approval
  "plan_referral_meeting",
  "list_referral_meetings",
  // the built-in call script (lib/referrals/call-script.ts), never a model-written one
  "referral_call_script",
];

/**
 * Approval kinds the demo shows: what the referral tools queue, and file_document (file_upload's
 * "keep this file" approval: her uploads are hers). aeon_action counts too when it wraps one of REFERRAL_DEMO_TOOLS.
 */
export const REFERRAL_DEMO_APPROVAL_KINDS: readonly string[] = ["referral_letter", "referral_meeting", "file_document"];

/** Files page and document index kinds shown in the demo: her own uploads and referral letters. */
export const REFERRAL_DEMO_FILE_KINDS: readonly string[] = ["uploaded", "referral_letter"];

/** Pages hidden in the demo (and everything under them); proxy.ts sends them to Home. */
export const REFERRAL_DEMO_HIDDEN_PAGES: readonly string[] = ["/admin"];

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
  // her niche (pre-selects the kinds below), then who she'd like to hear from
  "referrals:niche",
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
  "/api/client-forms",
  "/api/payers",
  "/api/credentialing",
  "/api/release-forms",
  "/api/obligations",
];

/** An API route of a hidden helper while the demo is on. */
export const hiddenApiInDemo = (pathname: string): boolean =>
  REFERRALS_ONLY_DEMO && REFERRAL_DEMO_HIDDEN_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** A page path the demo hides (never an API route). */
export const hiddenInDemo = (pathname: string): boolean =>
  REFERRALS_ONLY_DEMO && REFERRAL_DEMO_HIDDEN_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** An approval kind the referrals-only demo keeps (every kind while it is off). */
export const demoApprovalKind = (kind: string): boolean => !REFERRALS_ONLY_DEMO || REFERRAL_DEMO_APPROVAL_KINDS.includes(kind);

/** A document or file kind shown on Files and to Aeon's document tools. */
export const fileKindEnabled = (kind: string): boolean => !REFERRALS_ONLY_DEMO || REFERRAL_DEMO_FILE_KINDS.includes(kind);

/** Whether the referrals-only demo shows an approval. `tool` is an aeon_action's payload.tool: only one wrapping a referral tool shows. */
export const demoApprovalShown = (kind: string, tool?: unknown): boolean =>
  kind === "aeon_action" ? !REFERRALS_ONLY_DEMO || (typeof tool === "string" && REFERRAL_DEMO_TOOLS.includes(tool)) : demoApprovalKind(kind);
