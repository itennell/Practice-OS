import { z } from "zod";
import { BY, refuse, UUID } from "@/lib/studio/http";
import { applyEdit } from "@/lib/studio/store";

// A change made on the canvas (drag, click text, trim): the same edit operations
// chat uses, checked the same way. `cursor` is the step she was looking at, so two
// tabs can't overwrite each other.
const body = z.object({ ops: z.array(z.unknown()).min(1).max(20), cursor: z.number().int().min(0) }).strict();

export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/studio/[id]/ops">) {
  const refused = refuse(request);
  if (refused) return refused;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!UUID.test(id) || !parsed.success) return Response.json({ error: "That change didn't come through. Try again." }, { status: 400 });
  const r = await applyEdit(id, parsed.data.ops, { source: "canvas", by: BY, expectCursor: parsed.data.cursor });
  return r.ok ? Response.json({ project: r.project, reply: r.reply }) : Response.json({ error: r.why, project: r.project }, { status: r.status });
}
