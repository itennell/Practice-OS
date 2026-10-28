import { ConnectError, finishConnect } from "@/lib/connect";
import { isConnectProvider, isLocalRequest } from "@/lib/connect/local-only";

// Where Google (directly) or the relay (for Instagram) sends her back after signing in.
export async function GET(request: Request, ctx: RouteContext<"/api/connect/[provider]/return">) {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  const to = (query: string) => Response.redirect(new URL(`/settings/connections?${query}`, url.origin), 303);
  if (!isConnectProvider(provider)) return Response.json({ error: "Unknown connection." }, { status: 404 });
  if (!isLocalRequest(request)) return to(`error=${encodeURIComponent("Connect from Practice-OS on your own computer.")}`);
  try {
    await finishConnect(provider, url.searchParams);
    return to(`connected=${provider}`);
  } catch (err) {
    console.error(`connect ${provider} return:`, err instanceof Error ? err.message : err);
    const message = err instanceof ConnectError ? err.message : "Sign-in didn't finish. Press Connect to try again.";
    return to(`error=${encodeURIComponent(message)}`);
  }
}
