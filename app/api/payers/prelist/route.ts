import { canDecide } from "@/lib/admin-guard";
import { isViewOnly } from "@/lib/aeon/demo";
import { prelistPayers } from "@/lib/payers/checklist";

// Adds a "not started" row for every payer that fits her license and state (the
// write half of the Insurance tab; reading it never writes). Called by the
// Insurance page when a payer has no row yet. Never on the view-only copy.
export async function POST(request: Request) {
  if (!canDecide(request) || isViewOnly(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  try {
    return Response.json({ added: await prelistPayers() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't save." }, { status: 400 });
  }
}
