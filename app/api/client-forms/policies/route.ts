import { canDecide } from "@/lib/admin-guard";
import { savePolicies } from "@/lib/client-forms/store";

// The practice policies every client form uses (cancellation window, fees, reply time).
export async function PUT(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  try {
    return Response.json({ policies: await savePolicies(await request.json().catch(() => null)) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message.slice(0, 600) : "Couldn't save that." }, { status: 400 });
  }
}
