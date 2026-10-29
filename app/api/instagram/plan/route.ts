import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";
import { planSeveral } from "@/lib/instagram/store";

const body = z
  .object({
    request: z.string().trim().min(3).max(600),
    count: z.union([z.literal(2), z.literal(3)]),
  })
  .strict();

// Plan several: 2 or 3 posts on what she typed, each checked, drawn and waiting
// for her approval. Takes a few minutes (three model calls per post); nothing is posted here.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!canDecide(request) || !isSameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tell Aeon what the posts should be about." }, { status: 400 });
  try {
    const r = await planSeveral("aeon:instagram", parsed.data.request, parsed.data.count);
    if (r.outcome === "declined") return Response.json({ error: r.why }, { status: 409 });
    return Response.json(r);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Aeon couldn't plan the posts. Try again." }, { status: 502 });
  }
}
