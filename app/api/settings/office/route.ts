import { ZodError, z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { feeScheduleSchema, officeHoursSchema, savePracticeSettings } from "@/lib/gfe/store";

// Her office hours (which days count toward Good Faith Estimate deadlines) and self-pay fees.
const bodySchema = z.object({ hours: officeHoursSchema, fees: feeScheduleSchema }).strict();

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  try {
    const body = bodySchema.parse(await request.json().catch(() => null));
    await savePracticeSettings(body, "clinician");
    return Response.json({ ok: true });
  } catch (err) {
    const error = err instanceof ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ") : err instanceof Error ? err.message : "Couldn't save.";
    return Response.json({ error }, { status: 400 });
  }
}
