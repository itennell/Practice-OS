import { WebChatError, webChatMessage, webChatThread } from "@/lib/frontdesk/webchat";

// The practice website chat. GET reads one conversation (the visitor's page
// asks every few seconds, so an approved reply shows up); POST sends a message.
// The conversation id is a random UUID only the visitor's browser holds.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("c") ?? "";
  const lines = await webChatThread(id);
  return lines ? Response.json({ lines }) : Response.json({ error: "No such chat." }, { status: 404 });
}

export async function POST(request: Request) {
  const b = ((await request.json().catch(() => ({}))) ?? {}) as { conversation?: unknown; text?: unknown };
  if (typeof b.text !== "string") return Response.json({ error: "Type a message first." }, { status: 400 });
  try {
    return Response.json(await webChatMessage({ conversation: typeof b.conversation === "string" ? b.conversation : null, text: b.text }));
  } catch (e) {
    if (e instanceof WebChatError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
