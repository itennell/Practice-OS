// Who may talk to the app on the clinician's computer. The local app trusts
// whoever reaches it (lib/admin-guard.ts), so it must only be reachable from
// its own pages on this computer:
//
// - Host: every request must name this computer (localhost, 127.0.0.1, [::1]).
//   A website that points its own name at 127.0.0.1 (DNS rebinding) sends its
//   own name as Host, so it is refused, even for reads like /api/approvals.
// - Same origin: every change (POST, PUT, PATCH, DELETE) must come from the
//   app's own page. Any web page can send a form post or a text/plain fetch to
//   127.0.0.1 without a CORS preflight; the browser's Sec-Fetch-Site (or, in
//   older browsers, Origin) tells us where it came from.
//
// The Vercel copy has its own guards (DEMO_PASSWORD, ADMIN_PASSWORD, Twilio
// signatures), and its webhook routes are posted to by other sites, so none of
// this applies there.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type Headers = { get(name: string): string | null };
type Incoming = { method: string; url: string; headers: Headers };

const hostOf = (request: Incoming) => request.headers.get("host") ?? new URL(request.url).host;

export function isLocalRequest(request: Incoming): boolean {
  if (process.env.VERCEL) return false;
  return LOCAL_HOSTS.has(hostOf(request).replace(/:\d+$/, ""));
}

export function isSameOrigin(request: Incoming): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === hostOf(request);
  } catch {
    return false;
  }
}

/** A local request from the app's own page. */
export const isLocalAppRequest = (request: Incoming) => isLocalRequest(request) && isSameOrigin(request);

/** Why the local app refuses this request, or null to let it through. Used by proxy.ts for every request. */
export function refusal(request: Incoming): string | null {
  if (process.env.VERCEL) return null;
  if (!isLocalRequest(request)) return "Practice-OS only answers on this computer.";
  if (!SAFE_METHODS.has(request.method.toUpperCase()) && !isSameOrigin(request)) return "Changes must come from Practice-OS itself.";
  return null;
}
