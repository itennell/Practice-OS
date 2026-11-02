import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";
import { regeneratePost } from "@/lib/studio/regenerate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Regenerate on a "Facts changed" flag: the same topic written again from her current
// facts, told what to avoid; the old post and its waiting approval are retired. Nothing is posted.
export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/instagram/posts/[id]/regenerate">) {
  if (!canDecide(request) || !isSameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "That post isn't here any more." }, { status: 404 });
  try {
    const r = await regeneratePost("aeon:instagram", id);
    if (!r.ok) return Response.json({ error: r.why }, { status: r.status });
    if (r.outcome === "declined") return Response.json({ error: r.why }, { status: 409 });
    return Response.json({ ...r, ok: undefined });
  } catch (err) {
    console.error("regenerate failed", err);
    return Response.json({ error: "Aeon couldn't write that post. Try again." }, { status: 502 });
  }
}
