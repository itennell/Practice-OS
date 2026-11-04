import { after, connection } from "next/server";
import { isViewOnly } from "@/lib/aeon/demo";
import { sweepIdle, tidyIfDue } from "@/lib/aeon/reflect";
import { loadMenuData } from "@/lib/ui/menu";

// The chat menu refreshes its counts and recent chats from here after she moves
// around or sends a message. Like /api/conversations, opening it also reflects any
// conversation that has gone quiet and once a day tidies memory (AGENTS.md > Aeon's
// memory), after the answer is sent. Demo visitors on the Vercel copy never start that.
export const maxDuration = 120;

export async function GET(request: Request) {
  await connection(); // read the database per request, never at build time
  const data = await loadMenuData();
  if (!isViewOnly(request)) {
    after(async () => {
      await sweepIdle().catch((err) => console.error(`[reflect] sweep: ${err instanceof Error ? err.message : String(err)}`));
      await tidyIfDue().catch((err) => console.error(`[reflect] tidy: ${err instanceof Error ? err.message : String(err)}`));
    });
  }
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
