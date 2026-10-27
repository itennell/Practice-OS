import { canDecide } from "@/lib/admin-guard";
import { checkNpiInRegistry } from "@/lib/credentialing/store";

// Looks her own NPI up in the public NPPES registry and saves the result.
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  try {
    return Response.json(await checkNpiInRegistry());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't check NPPES." }, { status: 502 });
  }
}
