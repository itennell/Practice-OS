-- 017: Connect buttons (desktop plan, relay and Connect).
--
-- 1. connections.provider: one Google sign-in now covers Gmail drafts
--    (Referrals) and Calendar (Front Desk), so 'gmail' becomes 'google'.
--    'phone' is her own phone company (meta.vendor says which; Front Desk
--    owns its shape). 'muse' is her own Meta Muse key. 'twilio' is replaced by
--    'phone'. The table is empty on the shared database today; any existing
--    'gmail' or 'twilio' row is renamed rather than dropped.
-- 2. connect_states: one row per sign-in in progress. It lives at most 10
--    minutes and is deleted when used. secret_enc holds the PKCE verifier
--    (Google) or the one-time key the relay seals the Instagram token with,
--    encrypted like every other stored secret (lib/secrets.ts).

alter table practice_os.connections drop constraint connections_provider_check;
update practice_os.connections set provider = 'google' where provider = 'gmail';
update practice_os.connections set provider = 'phone', meta = meta || '{"vendor": "twilio"}'::jsonb where provider = 'twilio';
alter table practice_os.connections add constraint connections_provider_check
  check (provider in ('instagram', 'google', 'calcom', 'phone', 'muse'));

create table practice_os.connect_states (
  state text primary key check (length(state) >= 32),
  provider text not null check (provider in ('instagram', 'google')),
  scopes text[] not null default '{}',
  redirect_uri text not null,
  secret_enc text not null check (secret_enc ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table practice_os.connect_states enable row level security;

comment on column practice_os.connect_states.secret_enc is
  'Encrypted with CONNECTIONS_ENCRYPTION_KEY via lib/secrets.ts. Never store a plain verifier or key.';
