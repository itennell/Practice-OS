import { canDecide } from "@/lib/admin-guard";
import { resetOverrides, saveOverrides } from "@/lib/client-forms/store";
import { isFormId } from "@/lib/client-forms/types";

// Her wording for one template. PUT saves edits (refused if they take out a
// required element or name a client); DELETE goes back to Aeon's wording.
export async function PUT(request: Request, ctx: RouteContext<"/api/client-forms/[form]">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { form } = await ctx.params;
  if (!isFormId(form)) return Response.json({ error: "Unknown form." }, { status: 404 });
  try {
    const { check } = await saveOverrides(form, await request.json().catch(() => null));
    return Response.json({ ok: true, grade: check.grade });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message.slice(0, 600) : "Couldn't save that." }, { status: 400 });
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/client-forms/[form]">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { form } = await ctx.params;
  if (!isFormId(form)) return Response.json({ error: "Unknown form." }, { status: 404 });
  await resetOverrides(form);
  return Response.json({ ok: true });
}
