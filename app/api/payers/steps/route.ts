import { z, ZodError } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { setStep } from "@/lib/payers/checklist";

// Checks or unchecks one step on her insurance checklist (the same function as Aeon's check_payer_step tool).
const body = z.object({ scope: z.string().regex(/^[a-z0-9-]{2,60}$/), step_id: z.string().regex(/^[a-z0-9-]{2,80}$/), done: z.boolean() }).strict();

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  try {
    return Response.json(await setStep(body.parse(await request.json().catch(() => null)), "clinician"));
  } catch (err) {
    const error = err instanceof ZodError ? "That isn't a step on your checklist." : err instanceof Error ? err.message : "Couldn't save.";
    return Response.json({ error }, { status: 400 });
  }
}
