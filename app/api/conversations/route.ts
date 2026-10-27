import { listConversations } from "@/lib/aeon/chat";

export async function GET() {
  const conversations = await listConversations();
  return Response.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
}
