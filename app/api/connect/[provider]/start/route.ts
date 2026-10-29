import { ConnectError, startConnect } from "@/lib/connect";
import { isConnectProvider, isLocalAppRequest } from "@/lib/connect/local-only";
import { isAllowedGoogleScope } from "@/lib/connect/google-scopes";

// The Connect button: a form POST from Settings › Connections (never a plain link,
// so another website can't start a sign-in) that sends her to Google's own sign-in
// page, or, through the relay, Instagram's. Field "scopes": comma-separated.
export async function POST(request: Request, ctx: RouteContext<"/api/connect/[provider]/start">) {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  const back = (error: string) => Response.redirect(new URL(`/settings/connections?error=${encodeURIComponent(error)}`, url.origin), 303);
  if (!isConnectProvider(provider)) return Response.json({ error: "Unknown connection." }, { status: 404 });
  if (!isLocalAppRequest(request)) return back("Connect from Practice-OS on your own computer.");
  const form = await request.formData().catch(() => null);
  const scopes = String(form?.get("scopes") ?? "").split(",").filter(Boolean);
  if (provider === "google" && !scopes.every(isAllowedGoogleScope)) return back("Practice-OS only asks Google for Gmail drafts and your calendar.");
  try {
    const { authUrl } = await startConnect(provider, { scopes, origin: url.origin });
    return Response.redirect(authUrl, 303);
  } catch (err) {
    console.error(`connect ${provider} start:`, err instanceof Error ? err.message : err);
    return back(err instanceof ConnectError ? err.message : `Couldn't start the ${provider === "google" ? "Google" : "Instagram"} sign-in. Try again in a minute.`);
  }
}
