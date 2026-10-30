import { UUID } from "@/lib/studio/http";
import { getProject } from "@/lib/studio/store";

export async function GET(_request: Request, ctx: RouteContext<"/api/studio/[id]">) {
  const { id } = await ctx.params;
  const project = UUID.test(id) ? await getProject(id) : null;
  if (!project) return Response.json({ error: "That isn't here any more." }, { status: 404 });
  return Response.json({ project });
}
