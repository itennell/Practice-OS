import { ZodError } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { createSuperbill } from "@/lib/superbill/store";

// She prepares a superbill by hand on Admin > Superbills (Aeon's chat uses
// the draft_superbill tool instead). Saved by reference with no client details.
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    const sb = await createSuperbill(body, { createdBy: "clinician" });
    return Response.json({ id: sb.id, reference: sb.reference }, { status: 201 });
  } catch (err) {
    const error = err instanceof ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ") : err instanceof Error ? err.message : "Couldn't save it.";
    return Response.json({ error }, { status: 400 });
  }
}
