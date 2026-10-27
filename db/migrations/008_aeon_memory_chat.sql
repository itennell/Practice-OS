-- Migration 008: Aeon's memory and chat history (AGENTS.md > Aeon's memory).
--
-- Practice-business facts only until there is a BAA. The app's sensitive-info
-- guard (lib/aeon/guard.ts) refuses client names, birth dates, diagnoses and ID
-- numbers before any insert here. A refused or crisis message is never stored.
-- audit_log rows about memories hold the memory id and kind, never its text,
-- because audit_log is append-only and the text must stay deletable.

-- 1. memories: what Aeon has learned about this practice. Rendered to
--    aeon/MEMORY.md (gitignored) and exposed to MCP clients as aeon://memory.
create table practice_os.memories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('preference', 'decision', 'fact', 'what_worked')),
  text text not null check (char_length(text) between 1 and 500),
  source text not null check (char_length(source) <= 80),  -- chat:<conversation id>, mcp:<client>, clinician
  supersedes_id uuid references practice_os.memories (id) on delete set null,
  archived boolean not null default false,                  -- forget() archives; the Memory page can delete
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_active_idx on practice_os.memories (kind, updated_at desc) where not archived;

-- 2. conversations: one row per chat with Aeon.
create table practice_os.conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat' check (char_length(title) between 1 and 120),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_recent_idx on practice_os.conversations (updated_at desc);

-- 3. chat_messages: what she said and what Aeon answered. Tool results are not
--    stored, only the plain-English steps ("Checked your deadlines", 0.4s).
create table practice_os.chat_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references practice_os.conversations (id) on delete cascade,
  role text not null check (role in ('clinician', 'aeon')),
  content text not null check (char_length(content) between 1 and 8000),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  approval_ids uuid[] not null default '{}',   -- approval cards shown under this reply
  created_at timestamptz not null default now()
);
create index chat_messages_conversation_idx on practice_os.chat_messages (conversation_id, id);

create trigger memories_touch_updated_at before update on practice_os.memories
  for each row execute function practice_os.touch_updated_at();
create trigger conversations_touch_updated_at before update on practice_os.conversations
  for each row execute function practice_os.touch_updated_at();

-- RLS on, no policies: only the owner connection (DATABASE_URL) can read or write.
alter table practice_os.memories enable row level security;
alter table practice_os.conversations enable row level security;
alter table practice_os.chat_messages enable row level security;
