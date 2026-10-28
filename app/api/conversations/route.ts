import { connection } from "next/server";
import { listConversations } from "@/lib/aeon/chat";

export async function GET() {
  await connection(); // read the database per request, never at build time
  const conversations = await listConversations();
  return Response.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
}
