// Connect buttons work only on the clinician's own computer: the sign-in comes
// back to this computer's address, and the Vercel copy is view-only. Checking
// the Host header also stops a web page from reaching the app through a DNS trick.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalRequest(request: Request): boolean {
  if (process.env.VERCEL) return false;
  const host = request.headers.get("host") ?? new URL(request.url).host;
  return LOCAL_HOSTS.has(host.replace(/:\d+$/, ""));
}

export const PROVIDERS = ["google", "instagram"] as const;
export const isConnectProvider = (p: string): p is (typeof PROVIDERS)[number] => (PROVIDERS as readonly string[]).includes(p);
