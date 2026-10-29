import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";
import { researchPost } from "@/lib/instagram/store";

const body = z.object({ topic: z.string().trim().min(3).max(300) }).strict();

// Research first: three small web searches at once, then 2-3 angles with their links.
// Nothing is written or posted here; it saves the research for a week.
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!canDecide(request) || !isSameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tell Aeon what the post should be about." }, { status: 400 });
  try {
    const r = await researchPost("aeon:instagram", parsed.data.topic);
    if (r.outcome === "declined") return Response.json({ error: r.why }, { status: 409 });
    return Response.json(r);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Aeon couldn't look into that. Try again." }, { status: 502 });
  }
}
