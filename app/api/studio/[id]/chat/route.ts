import { z } from "zod";
import { BY, refuse, UUID } from "@/lib/studio/http";
import { chatEdit } from "@/lib/studio/store";

const body = z.object({ text: z.string().trim().min(1).max(600) }).strict();

// One chat instruction on what's open ("make slide 2 shorter"): the crisis check
// and PHI guard, then Muse proposes edit operations and plain code applies them.
export const maxDuration = 120;

export async function POST(request: Request, ctx: RouteContext<"/api/studio/[id]/chat">) {
  const refused = refuse(request);
  if (refused) return refused;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!UUID.test(id) || !parsed.success) return Response.json({ error: "Tell Aeon what to change." }, { status: 400 });
  const r = await chatEdit(id, parsed.data.text, { by: BY });
  return r.ok ? Response.json({ project: r.project, reply: r.reply }) : Response.json({ error: r.why, project: r.project, hardStop: r.hardStop ?? false }, { status: r.status });
}
