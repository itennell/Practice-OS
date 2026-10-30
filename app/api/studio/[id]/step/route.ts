import { z } from "zod";
import { BY, refuse, UUID } from "@/lib/studio/http";
import { goToStep } from "@/lib/studio/store";

// The version list: go back (or forward) to any step; 0 is how Aeon first made it.
const body = z.object({ seq: z.number().int().min(0), reapprove: z.boolean().optional() }).strict();

export async function POST(request: Request, ctx: RouteContext<"/api/studio/[id]/step">) {
  const refused = refuse(request);
  if (refused) return refused;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!UUID.test(id) || !parsed.success) return Response.json({ error: "That version isn't here." }, { status: 400 });
  const r = await goToStep(id, parsed.data.seq, { by: BY, reapprove: parsed.data.reapprove });
  return r.ok ? Response.json({ project: r.project, reply: r.reply }) : Response.json({ error: r.why, project: r.project, needsReapproval: r.needsReapproval ?? false }, { status: r.status });
}
