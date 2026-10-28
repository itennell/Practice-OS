// Spike: Google Calendar freeBusy for the next 7 days on the primary calendar.
// Desktop-app OAuth with a loopback redirect and PKCE; read-only, nothing is written.
//
// Run: npx tsx scripts/spike-gcal.ts   (prints a link; open it, sign in, allow)
//
// Docs used (read 2026-10-28):
// - freeBusy.query: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
//   POST https://www.googleapis.com/calendar/v3/freeBusy, body { timeMin, timeMax, timeZone, items: [{ id }] }.
//   Accepted scopes: calendar.readonly, calendar, calendar.events.freebusy, calendar.freebusy.
//   We use https://www.googleapis.com/auth/calendar.freebusy: the narrowest listed scope that
//   is enough (busy times only, no event titles or attendees).
// - Installed-app OAuth: https://developers.google.com/identity/protocols/oauth2/native-app
//   Auth: https://accounts.google.com/o/oauth2/v2/auth (client_id, redirect_uri http://127.0.0.1:<port>,
//   response_type=code, scope, code_challenge + S256, state). Token: https://oauth2.googleapis.com/token
//   (client_id, client_secret, code, code_verifier, grant_type=authorization_code, redirect_uri).
//   The OAuth client must be type "Desktop app" (any loopback port is then allowed).
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { call, requireEnv, saveFixture } from "./spike-lib";

const SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}`;

const env = requireEnv("spike-gcal", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
const b64url = (buf: Buffer) => buf.toString("base64url");
const verifier = b64url(randomBytes(48)); // 64 chars, within 43-128
const challenge = b64url(createHash("sha256").update(verifier).digest());
const state = b64url(randomBytes(16));

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: env.GOOGLE_CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: SCOPE,
  code_challenge: challenge,
  code_challenge_method: "S256",
  state,
})}`;

// Wait for Google to redirect the browser back to 127.0.0.1 with ?code=...
const code = await new Promise<string>((resolve, reject) => {
  const timer = setTimeout(() => {
    server.close();
    reject(new Error("No answer from the browser within 5 minutes."));
  }, 5 * 60 * 1000);
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", REDIRECT);
    if (u.pathname !== "/") {
      res.writeHead(404).end();
      return;
    }
    const err = u.searchParams.get("error");
    const got = u.searchParams.get("code");
    const okState = u.searchParams.get("state") === state;
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end(err || !got || !okState ? `Sign-in did not finish (${err ?? "bad state or no code"}). You can close this tab.` : "Done. You can close this tab and go back to the terminal.");
    clearTimeout(timer);
    server.close();
    if (err) reject(new Error(`Google said: ${err}`));
    else if (!okState) reject(new Error("State did not match; ignoring this answer."));
    else if (!got) reject(new Error("No code in the redirect."));
    else resolve(got);
  });
  server.on("error", reject);
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`\nOpen this link in your browser, sign in with the calendar's Google account, and click Allow:\n\n${authUrl}\n`);
    console.log(`Waiting on ${REDIRECT} ...`);
  });
});

let ok = false;
try {
  const token = await call("POST", "https://oauth2.googleapis.com/token", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT,
    }).toString(),
    logBody: { grant_type: "authorization_code", redirect_uri: REDIRECT, code: "[redacted]" },
  });
  const accessToken = (token.body as { access_token?: string }).access_token;
  if (!accessToken) throw new Error("Token exchange failed (see the response above).");
  console.log(`Granted scope: ${(token.body as { scope?: string }).scope}`);

  const timeMin = new Date();
  const timeMax = new Date(timeMin.getTime() + 7 * 24 * 3600 * 1000);
  const body = {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    timeZone: process.env.CALCOM_TIME_ZONE || "America/Chicago",
    items: [{ id: "primary" }],
  };
  const fb = await call("POST", "https://www.googleapis.com/calendar/v3/freeBusy", {
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    logBody: body,
  });
  ok = fb.status === 200;
  const busy = (fb.body as { calendars?: Record<string, { busy?: { start: string; end: string }[] } > }).calendars?.primary?.busy ?? [];
  console.log(`\nBusy blocks in the next 7 days: ${busy.length}`);
  for (const b of busy) console.log(`  ${b.start} to ${b.end}`);
  await saveFixture("gcal", ok, { scope: SCOPE });
} catch (err) {
  console.error(`\nspike-gcal failed: ${(err as Error).message}`);
  await saveFixture("gcal", false, { scope: SCOPE });
  process.exit(1);
}
process.exit(ok ? 0 : 1);
