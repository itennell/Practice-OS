import { ZodError } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { draftEstimate } from "@/lib/gfe/store";

// She drafts a Good Faith Estimate: it's saved (no client identity) and one
// gfe_issue approval is queued. Nothing is issued until she approves it.
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    const result = await draftEstimate(body, { createdBy: "aeon:admin" });
    return Response.json(result, { status: 201 });
  } catch (err) {
    const error = err instanceof ZodError ? err.issues.map((i) => i.message).join(" ") : err instanceof Error ? err.message : "Couldn't save it.";
    return Response.json({ error }, { status: 400 });
  }
}
