-- 010: Aeon's reflection pass (AGENTS.md > Aeon's memory).
--
-- After a chat, and once a day, muse-spark-1.3 rereads the conversation and
-- proposes memory changes (add, update, retire). Plain code checks each one
-- (lib/aeon/memory-ops.ts) and applies it; the model never writes rows.
-- Adds two columns per table, no new tables, nothing dropped.

-- 1. How far each conversation has been reflected: the last chat_messages.id
--    read. A conversation is reflected once; a second pass reads 0 new messages.
alter table practice_os.conversations
  add column reflected_through bigint not null default 0,
  add column reflected_at timestamptz;

-- 2. The memory that replaced this one (a retired memory keeps a pointer
--    forward; supersedes_id on the new row already points back).
alter table practice_os.memories
  add column superseded_by uuid references practice_os.memories (id) on delete set null;

-- 3. Which practice topic a memory belongs to. Reflection only saves these
--    topics; memories saved before 010 have none.
alter table practice_os.memories
  add column topic text check (topic in (
    'fees_billing', 'schedule', 'payers_credentialing', 'referrals',
    'marketing', 'admin_compliance', 'working_style'
  ));
