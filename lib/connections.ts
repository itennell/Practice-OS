import { db } from "./db";
import { decryptSecret, encryptSecret } from "./secrets";

// The only code that reads or writes practice_os.connections. Tokens are
// encrypted here before they reach the database and decrypted on the way out.
export type Provider = "instagram" | "google" | "calcom" | "phone" | "muse";

export type Connection = {
  provider: Provider;
  accountLabel: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: Date | null;
  meta: Record<string, unknown>;
};

const seal = (provider: Provider, field: string, value: string | null) =>
  value == null ? null : encryptSecret(value, `${provider}:${field}`);
const open = (provider: Provider, field: string, value: string | null) =>
  value == null ? null : decryptSecret(value, `${provider}:${field}`);

export async function saveConnection(c: Connection): Promise<void> {
  await db()`
    insert into practice_os.connections
      (provider, account_label, access_token_enc, refresh_token_enc, scopes, expires_at, meta)
    values (
      ${c.provider}, ${c.accountLabel},
      ${seal(c.provider, "access_token", c.accessToken)}, ${seal(c.provider, "refresh_token", c.refreshToken)},
      ${c.scopes}, ${c.expiresAt}, ${db().json(c.meta as never)}
    )
    on conflict (provider) do update set
      account_label = excluded.account_label,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      scopes = excluded.scopes,
      expires_at = excluded.expires_at,
      meta = excluded.meta
  `;
}

export async function getConnection(provider: Provider): Promise<Connection | null> {
  const [row] = await db()`
    select account_label, access_token_enc, refresh_token_enc, scopes, expires_at, meta
    from practice_os.connections where provider = ${provider}
  `;
  if (!row) return null;
  return {
    provider,
    accountLabel: row.account_label,
    accessToken: open(provider, "access_token", row.access_token_enc),
    refreshToken: open(provider, "refresh_token", row.refresh_token_enc),
    scopes: row.scopes,
    expiresAt: row.expires_at,
    meta: row.meta,
  };
}

export async function deleteConnection(provider: Provider): Promise<void> {
  await db()`delete from practice_os.connections where provider = ${provider}`;
}
