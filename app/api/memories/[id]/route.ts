import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { MEMORY_KINDS, MemoryRefused, deleteMemory, editMemory, forget, getMemory, restore } from "@/lib/aeon/memory";
import { isUuid } from "../../approvals/responses";

const by = { actor: "clinician" as const, source: "clinician" };
const change = z
  .object({
    text: z.string().trim().min(3, "Write a little more.").max(500, "Keep it under 500 characters.").optional(),
    kind: z.enum(MEMORY_KINDS).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

/** Edit the text or kind, or switch a memory off (archived) and back on. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/memories/[id]">) {
  if (!canDecide(request)) return Response.json({ error: "This demo is view-only." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await getMemory(id))) return Response.json({ error: "That memory no longer exists." }, { status: 404 });
  const parsed = change.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const { text, kind, archived } = parsed.data;
  try {
    let memory = text !== undefined || kind !== undefined ? await editMemory(id, { text, kind }, by) : await getMemory(id);
    if (archived === true) memory = (await forget(id, by)) ?? memory;
    if (archived === false) memory = (await restore(id, by)) ?? memory;
    return Response.json({ memory });
  } catch (err) {
    if (err instanceof MemoryRefused) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/memories/[id]">) {
  if (!canDecide(request)) return Response.json({ error: "This demo is view-only." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await deleteMemory(id, by))) return Response.json({ error: "That memory no longer exists." }, { status: 404 });
  return Response.json({ ok: true });
}
