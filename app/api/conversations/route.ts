import { after, connection } from "next/server";
import { listConversations } from "@/lib/aeon/chat";
import { isViewOnly } from "@/lib/aeon/demo";
import { sweepIdle, tidyIfDue } from "@/lib/aeon/reflect";

// Opening the chat list also reflects any conversation that has gone quiet,
// and once a day tidies memory (AGENTS.md > Aeon's memory), after the list is
// sent. This is the daily pass on her own computer, which has no cron. A Vercel
// copy uses /api/cron/reflect instead, so demo visitors never start a model call here.
export const maxDuration = 120;

export async function GET(request: Request) {
  await connection(); // read the database per request, never at build time
  const conversations = await listConversations();
  if (!isViewOnly(request)) {
    after(async () => {
      await sweepIdle().catch((err) => console.error(`[reflect] sweep: ${err instanceof Error ? err.message : String(err)}`));
      await tidyIfDue().catch((err) => console.error(`[reflect] tidy: ${err instanceof Error ? err.message : String(err)}`));
    });
  }
  return Response.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
}
