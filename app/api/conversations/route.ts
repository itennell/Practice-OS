import { after, connection } from "next/server";
import { listConversations } from "@/lib/aeon/chat";
import { isViewOnly } from "@/lib/aeon/demo";
import { sweepIdle } from "@/lib/aeon/reflect";

// Opening the chat list also reflects any conversation that has gone quiet
// (AGENTS.md > Aeon's memory), after the list is sent. The Vercel copy relies
// on its daily cron instead, so demo visitors never start a model call here.
export const maxDuration = 120;

export async function GET(request: Request) {
  await connection(); // read the database per request, never at build time
  const conversations = await listConversations();
  if (!isViewOnly(request)) {
    after(() => sweepIdle().catch((err) => console.error(`[reflect] sweep: ${err instanceof Error ? err.message : String(err)}`)));
  }
  return Response.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
}
