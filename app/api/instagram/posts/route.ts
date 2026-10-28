import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { listPosts, requestPost } from "@/lib/instagram/store";

export async function GET() {
  return Response.json({ posts: await listPosts() });
}

const body = z
  .object({
    request: z.string().trim().min(3).max(600),
    pillar: z.enum(["first_session", "fees_superbills", "how_to_book", "meet_the_clinician", "office_telehealth"]).nullable().default(null),
  })
  .strict();

// One post she asked for in her own words.
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tell Aeon what the post should be about." }, { status: 400 });
  try {
    return Response.json(await requestPost("aeon:instagram", parsed.data.request, parsed.data.pillar));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Aeon couldn't write that post. Try again." }, { status: 502 });
  }
}
