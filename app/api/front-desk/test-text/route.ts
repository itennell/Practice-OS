import { FRONT_DESK_ENABLED } from "@/lib/features";
import { canDecide } from "@/lib/admin-guard";
import { queueTestText, TestConsoleError } from "@/lib/frontdesk/test-console";

// "Send a test text to my phone". Takes no number on purpose: the text goes to
// her own alert phone only, as one approval she taps.
export async function POST(request: Request) {
  if (!FRONT_DESK_ENABLED) return Response.json({ error: "Not found." }, { status: 404 }); // paused (lib/features.ts)
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  try {
    return Response.json(await queueTestText());
  } catch (e) {
    if (e instanceof TestConsoleError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
