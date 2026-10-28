import { requireEnv } from "../env";

// Google sign-in for an installed app (checked 2026-10-28 against
// developers.google.com/identity/protocols/oauth2/native-app): PKCE plus a
// loopback return to the app on this computer, so no relay is involved.
// Installed apps can't add scopes later, so each Connect asks for every scope
// she has granted so far plus the new ones.

const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

export { GOOGLE_SCOPES } from "./google-scopes";

/** Always asked for, to show which account is connected. */
export const GOOGLE_BASE_SCOPES = ["openid", "email"];

export type GoogleTokens = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

export function googleAuthUrl(scopes: string[], redirectUri: string, state: string, codeChallenge: string): string {
  const q = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTHORIZE}?${q}`;
}

async function tokenRequest(fields: Record<string, string>): Promise<GoogleTokens> {
  const body = new URLSearchParams({ client_id: requireEnv("GOOGLE_CLIENT_ID"), ...fields });
  // A Desktop client's secret isn't confidential, but Google still accepts it; send it when set.
  if (process.env.GOOGLE_CLIENT_SECRET) body.set("client_secret", process.env.GOOGLE_CLIENT_SECRET);
  const res = await fetch(TOKEN, { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as GoogleTokens & { error?: string };
  if (!res.ok) throw new Error(`Google sign-in failed: ${json.error ?? res.status}`); // never echo tokens
  return json;
}

export function exchangeGoogleCode(code: string, codeVerifier: string, redirectUri: string): Promise<GoogleTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: redirectUri });
}

export function refreshGoogle(refreshToken: string): Promise<GoogleTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** The account's email from the ID token. It came straight from Google's token endpoint over TLS, so it isn't re-verified. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}
