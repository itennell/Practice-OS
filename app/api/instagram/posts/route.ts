import { connection } from "next/server";
import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";
import { listPosts, requestPost } from "@/lib/instagram/store";

export async function GET() {
  await connection(); // per request, never at build time
  return Response.json({ posts: await listPosts() });
}

const body = z
  .object({
    request: z.string().trim().min(3).max(600),
    pillar: z.enum(["first_session", "fees_superbills", "how_to_book", "meet_the_clinician", "office_telehealth"]).nullable().default(null),
    research_id: z.string().uuid().optional(),
    angle: z.number().int().min(0).max(2).optional(),
  })
  .strict();

// One post she asked for in her own words.
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!canDecide(request) || !isSameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tell Aeon what the post should be about." }, { status: 400 });
  try {
    const r = await requestPost("aeon:instagram", parsed.data.request, parsed.data.pillar, { research: parsed.data.research_id ? { id: parsed.data.research_id, angle: parsed.data.angle ?? 0 } : undefined });
    if (r.outcome === "declined") return Response.json({ error: r.why }, { status: 409 });
    return Response.json(r);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Aeon couldn't write that post. Try again." }, { status: 502 });
  }
}
