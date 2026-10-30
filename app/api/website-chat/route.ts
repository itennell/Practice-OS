import { WebChatError, webChatMessage, webChatThread } from "@/lib/frontdesk/webchat";
import {
  allowWebChat,
  WEB_CHAT_READS_PER_MINUTE,
  webChatClientIp,
} from "@/lib/frontdesk/webchat-rate-limit";
import { isSameOrigin } from "@/lib/request-guard";

// The practice website chat. GET reads one conversation (the visitor's page
// asks every few seconds, so an approved reply shows up); POST sends a message.
// The conversation id is a random UUID only the visitor's browser holds.
export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Website chat requests must come from this page." }, { status: 403 });
  if (!allowWebChat(`read:${webChatClientIp(request)}`, WEB_CHAT_READS_PER_MINUTE)) {
    return Response.json({ error: "That is a lot of refreshes. Wait a minute and try again." }, { status: 429 });
  }
  const id = new URL(request.url).searchParams.get("c") ?? "";
  const lines = await webChatThread(id);
  return lines ? Response.json({ lines }) : Response.json({ error: "No such chat." }, { status: 404 });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Website chat requests must come from this page." }, { status: 403 });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Send the message as JSON." }, { status: 415 });
  }
  const b = ((await request.json().catch(() => ({}))) ?? {}) as { conversation?: unknown; text?: unknown };
  if (typeof b.text !== "string") return Response.json({ error: "Type a message first." }, { status: 400 });
  try {
    return Response.json(
      await webChatMessage({
        conversation: typeof b.conversation === "string" ? b.conversation : null,
        text: b.text,
        rateLimitKey: `write:${webChatClientIp(request)}`,
      }),
    );
  } catch (e) {
    if (e instanceof WebChatError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
