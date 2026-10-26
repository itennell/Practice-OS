-- 002: stored sign-in tokens are only ever kept encrypted (lib/secrets.ts, AES-256-GCM).
-- The columns are renamed so no code can mistake them for plain tokens, and a CHECK
-- rule refuses any value that is not in the encrypted format. The table is empty
-- today; if it ever held a plain token, this migration would fail instead of keeping it.

alter table practice_os.connections rename column access_token to access_token_enc;
alter table practice_os.connections rename column refresh_token to refresh_token_enc;

alter table practice_os.connections add constraint connections_tokens_encrypted check (
  (access_token_enc is null or access_token_enc ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$')
  and (refresh_token_enc is null or refresh_token_enc ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$')
);

comment on column practice_os.connections.access_token_enc is
  'Encrypted with CONNECTIONS_ENCRYPTION_KEY via lib/secrets.ts. Never store a plain token.';
comment on column practice_os.connections.refresh_token_enc is
  'Encrypted with CONNECTIONS_ENCRYPTION_KEY via lib/secrets.ts. Never store a plain token.';
