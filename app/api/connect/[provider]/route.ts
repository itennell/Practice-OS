import { canDecide } from "@/lib/admin-guard";
import { disconnect } from "@/lib/connect";
import { isConnectProvider, isLocalAppRequest } from "@/lib/connect/local-only";

// Disconnect: forgets the stored sign-in, and revokes it at Google. For Instagram, `note` says where to remove it there.
export async function DELETE(request: Request, ctx: RouteContext<"/api/connect/[provider]">) {
  const { provider } = await ctx.params;
  if (!isConnectProvider(provider)) return Response.json({ error: "Unknown connection." }, { status: 404 });
  if (!canDecide(request) || !isLocalAppRequest(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { revoked, note } = await disconnect(provider);
  return Response.json({ provider, connected: false, revoked, note });
}
