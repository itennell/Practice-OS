// Connect buttons work only on the clinician's own computer: the sign-in comes
// back to this computer's address, and the Vercel copy is view-only. Checking
// the Host header also stops a web page from reaching the app through a DNS trick.
//
// Same-origin check: any web page she has open can send a request to
// http://127.0.0.1:<port>, and a form or a text/plain fetch reaches the server
// without a CORS preflight. So every change, and the start of every sign-in,
// must come from the app's own pages: the browser's Sec-Fetch-Site says
// "same-origin", or (older browsers) the Origin header matches the Host.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const hostOf = (request: Request) => request.headers.get("host") ?? new URL(request.url).host;

export function isLocalRequest(request: Request): boolean {
  if (process.env.VERCEL) return false;
  return LOCAL_HOSTS.has(hostOf(request).replace(/:\d+$/, ""));
}

export function isSameOrigin(request: Request): boolean {
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

/** A local request from the app's own page: what every Connect change needs. */
export const isLocalAppRequest = (request: Request) => isLocalRequest(request) && isSameOrigin(request);

export const PROVIDERS = ["google", "instagram"] as const;
export const isConnectProvider = (p: string): p is (typeof PROVIDERS)[number] => (PROVIDERS as readonly string[]).includes(p);
