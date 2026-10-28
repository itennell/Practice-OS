import { ConnectError, startConnect } from "@/lib/connect";
import { isConnectProvider, isLocalRequest } from "@/lib/connect/local-only";

// The Connect button: GET /api/connect/google/start?scopes=a,b sends her to Google's
// (or, through the relay, Instagram's) own sign-in page.
export async function GET(request: Request, ctx: RouteContext<"/api/connect/[provider]/start">) {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  const back = (error: string) => Response.redirect(new URL(`/settings/connections?error=${encodeURIComponent(error)}`, url.origin), 303);
  if (!isConnectProvider(provider)) return Response.json({ error: "Unknown connection." }, { status: 404 });
  if (!isLocalRequest(request)) return back("Connect from Practice-OS on your own computer.");
  const scopes = (url.searchParams.get("scopes") ?? "").split(",").filter(Boolean);
  try {
    const { authUrl } = await startConnect(provider, { scopes, origin: url.origin });
    return Response.redirect(authUrl, 303);
  } catch (err) {
    console.error(`connect ${provider} start:`, err instanceof Error ? err.message : err);
    return back(err instanceof ConnectError ? err.message : `Couldn't start the ${provider === "google" ? "Google" : "Instagram"} sign-in. Check the setup in INSTALL.md.`);
  }
}
