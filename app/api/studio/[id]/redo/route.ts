import { refuse, UUID } from "@/lib/studio/http";
import { moveCursor } from "@/lib/studio/store";

export async function POST(request: Request, ctx: RouteContext<"/api/studio/[id]/redo">) {
  const refused = refuse(request);
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "That isn't here any more." }, { status: 404 });
  const r = await moveCursor(id, 1);
  return r.ok ? Response.json({ project: r.project, reply: r.reply }) : Response.json({ error: r.why, project: r.project }, { status: r.status });
}
