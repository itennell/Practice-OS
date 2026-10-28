// Instagram API with Instagram Login, from Meta's docs (checked 2026-10-28):
// developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
// The relay does the code exchange because it needs the app secret, which
// never ships inside Practice-OS.

export const GRAPH = "https://graph.instagram.com";
export const GRAPH_VERSION = "v26.0";
export const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES.join(","), state });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

export type InstagramToken = { accessToken: string; expiresIn: number; userId: string; username: string; scopes: string[] };

async function json(res: Response, step: string) {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Instagram ${step} failed (${res.status})`); // never echo the body: it may hold a token
  return body;
}

/** Code (single use, 1 hour) to a long-lived token (about 60 days), plus who signed in. */
export async function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<InstagramToken> {
  const short = await json(
    await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, "") }),
    }),
    "code exchange",
  );
  const first = (Array.isArray(short.data) ? short.data[0] : short) as { access_token: string; permissions?: string | string[] };
  const long = await json(
    await fetch(`${GRAPH}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: clientSecret, access_token: first.access_token })}`),
    "long-lived exchange",
  );
  const me = await whoAmI(long.access_token as string);
  const permissions = typeof first.permissions === "string" ? first.permissions.split(",") : (first.permissions ?? SCOPES);
  return { accessToken: long.access_token as string, expiresIn: Number(long.expires_in), userId: me.userId, username: me.username, scopes: permissions };
}

export async function whoAmI(accessToken: string): Promise<{ userId: string; username: string }> {
  const me = await json(await fetch(`${GRAPH}/${GRAPH_VERSION}/me?${new URLSearchParams({ fields: "user_id,username", access_token: accessToken })}`), "profile");
  return { userId: String(me.user_id), username: String(me.username) };
}
