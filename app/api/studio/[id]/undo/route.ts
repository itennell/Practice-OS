import { z } from "zod";
import { BY, refuse, UUID } from "@/lib/studio/http";
import { moveCursor } from "@/lib/studio/store";

// reapprove: she said Continue to "Editing this will need a new approval".
const body = z.object({ reapprove: z.boolean().optional() }).strict();

export async function POST(request: Request, ctx: RouteContext<"/api/studio/[id]/undo">) {
  const refused = refuse(request);
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "That isn't here any more." }, { status: 404 });
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "That didn't come through. Try again." }, { status: 400 });
  const r = await moveCursor(id, -1, { by: BY, reapprove: parsed.data.reapprove });
  return r.ok ? Response.json({ project: r.project, reply: r.reply }) : Response.json({ error: r.why, project: r.project, needsReapproval: r.needsReapproval ?? false }, { status: r.status });
}
