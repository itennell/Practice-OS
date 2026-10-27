import { ZodError } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { savePayerApplication } from "@/lib/payers/store";

// Adds or updates one insurance application (the same function as Aeon's update_payer_application tool).
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  try {
    return Response.json(await savePayerApplication(await request.json().catch(() => null), "clinician"));
  } catch (err) {
    const error = err instanceof ZodError ? err.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`).join(" ") : err instanceof Error ? err.message : "Couldn't save.";
    return Response.json({ error }, { status: 400 });
  }
}
