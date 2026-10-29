import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";
import { getReel, REEL_SECONDS, saveReel, SLIDE_TEXT_MAX } from "@/lib/instagram/reel";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reel = z
  .object({
    seconds: z.number().int().min(REEL_SECONDS.min).max(REEL_SECONDS.max),
    slides: z
      .array(z.object({ kind: z.enum(["picture", "point", "book"]), text: z.string().max(SLIDE_TEXT_MAX * 2) }).strict())
      .min(3)
      .max(5),
  })
  .strict();

function allowed(request: Request) {
  return canDecide(request) && isSameOrigin(request) && Boolean(request.headers.get("content-type")?.includes("application/json"));
}

// POST: her saved reel for this post, or a first draft (Muse picks 2-3 points from the caption).
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/instagram/posts/[id]/reel">) {
  if (!allowed(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "That post isn't here any more." }, { status: 404 });
  const r = await getReel(id);
  return r.ok ? Response.json({ reel: r.reel, credits: r.credits }) : Response.json({ error: r.why }, { status: r.status });
}

// PUT: saves her edits (words, order, length) after the safety check; the video is made from these only.
export async function PUT(request: Request, ctx: RouteContext<"/api/instagram/posts/[id]/reel">) {
  if (!allowed(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "That post isn't here any more." }, { status: 404 });
  const parsed = reel.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "The reel needs 3 to 5 slides and a length of 10 to 20 seconds." }, { status: 400 });
  const r = await saveReel(id, parsed.data);
  return r.ok ? Response.json({ reel: r.reel }) : Response.json({ error: r.why, problems: r.problems ?? [] }, { status: r.status });
}
