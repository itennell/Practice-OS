-- 011: how much Aeon may do on its own, like a coding agent's permission modes.
--
-- 1. settings.approval_mode: the default for new chats and for outside agents
--    over MCP (capped at auto in code). manual = ask before anything; auto = run
--    routine work, ask about the rest; bypass = run everything except what only
--    the clinician may hand to a client (never auto-run before a BAA, in code).
-- 2. conversations.approval_mode: the mode picked under the chat box for that
--    chat; null = the default.
-- 3. settings.front_desk_rules: Front Desk's own standing rules, which the chat
--    mode doesn't touch. text_missed_callers: a missed caller gets a text with
--    open consult times (logistics only, crisis check first).
-- 4. approvals accept aeon_action: in manual mode, a change Aeon wants to make to
--    her records waits as one of these until she approves it.
-- The unused settings.auto_approve_kinds column stays; nothing reads it.

alter table practice_os.settings
  add column approval_mode text not null default 'auto'
    check (approval_mode in ('manual', 'auto', 'bypass')),
  add column front_desk_rules jsonb not null default '{"text_missed_callers": true}'::jsonb
    check (jsonb_typeof(front_desk_rules) = 'object' and jsonb_typeof(front_desk_rules -> 'text_missed_callers') = 'boolean');

alter table practice_os.conversations
  add column approval_mode text check (approval_mode in ('manual', 'auto', 'bypass'));

alter table practice_os.approvals drop constraint approvals_kind_check;
alter table practice_os.approvals add constraint approvals_kind_check check (kind in (
  'referral_letter', 'instagram_post', 'sms_reply', 'consult_booking',
  'consult_reschedule', 'consult_cancel', 'web_chat_reply',
  'test_note', 'state_rules', 'gfe_issue', 'aeon_action'
));
