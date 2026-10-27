import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { MEMORY_KINDS, MemoryRefused, listMemories, remember } from "@/lib/aeon/memory";

export async function GET() {
  const memories = await listMemories({ includeArchived: true });
  return Response.json({ memories }, { headers: { "Cache-Control": "no-store" } });
}

const body = z.object({ kind: z.enum(MEMORY_KINDS), text: z.string().trim().min(3, "Write a little more.").max(500, "Keep it under 500 characters.") });

/** She adds a memory herself on the Memory page. It passes the same guard as Aeon's. */
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "This demo is view-only." }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  try {
    const { memory, created } = await remember(parsed.data, { actor: "clinician", source: "clinician" });
    return Response.json({ memory, created }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof MemoryRefused) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
