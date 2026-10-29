import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";
import { retryPost } from "@/lib/instagram/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Retry: draw the picture again and queue a fresh approval. Nothing is posted here.
export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/instagram/posts/[id]/retry">) {
  if (!canDecide(request) || !isSameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "That post isn't here any more." }, { status: 404 });
  try {
    const r = await retryPost("aeon:instagram", id);
    return r.ok ? Response.json({ approval_id: r.approvalId }) : Response.json({ error: r.why }, { status: r.status });
  } catch {
    return Response.json({ error: "Aeon couldn't finish the picture. Try again." }, { status: 502 });
  }
}
