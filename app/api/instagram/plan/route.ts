import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";
import { PLAN_COUNT, planSeveral } from "@/lib/instagram/store";

const body = z
  .object({
    request: z.string().trim().min(3).max(600),
    count: z.number().int().min(PLAN_COUNT.min).max(PLAN_COUNT.max),
    research_id: z.string().uuid().optional(),
    angle: z.number().int().min(0).max(2).optional(),
  })
  .strict();

// Plan several: 1 to 5 posts on what she typed, each checked, drawn and waiting
// for her approval. Takes a few minutes (three model calls per post); nothing is posted here.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!canDecide(request) || !isSameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tell Aeon what the posts should be about." }, { status: 400 });
  try {
    const r = await planSeveral("aeon:instagram", parsed.data.request, parsed.data.count, { research: parsed.data.research_id ? { id: parsed.data.research_id, angle: parsed.data.angle ?? 0 } : undefined });
    if (r.outcome === "declined") return Response.json({ error: r.why }, { status: 409 });
    return Response.json(r);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Aeon couldn't plan the posts. Try again." }, { status: 502 });
  }
}
