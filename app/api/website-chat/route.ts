import { WebChatError, webChatMessage, webChatThread } from "@/lib/frontdesk/webchat";
import {
  allowWebChat,
  WEB_CHAT_MAX_BODY_BYTES,
  WEB_CHAT_READS_PER_MINUTE,
  webChatClientIp,
} from "@/lib/frontdesk/webchat-rate-limit";
import { FRONT_DESK_ENABLED } from "@/lib/features";
import { isLocalRequest, isSameOrigin } from "@/lib/request-guard";

// The practice website chat. GET reads one conversation (the visitor's page
// asks every few seconds, so an approved reply shows up); POST sends a message.
// The conversation id is a random UUID only the visitor's browser holds.
// It answers only on her own computer for now: the Vercel copy has no working
// visitor gate, so there it is a plain 404 (proxy.ts refuses it first too).
const notHere = () => Response.json({ error: "Not found." }, { status: 404 });

export async function GET(request: Request) {
  if (!FRONT_DESK_ENABLED || !isLocalRequest(request)) return notHere();
  if (!isSameOrigin(request)) return Response.json({ error: "Website chat requests must come from this page." }, { status: 403 });
  if (!allowWebChat(`read:${webChatClientIp(request)}`, WEB_CHAT_READS_PER_MINUTE)) {
    return Response.json({ error: "That is a lot of refreshes. Wait a minute and try again." }, { status: 429 });
  }
  const id = new URL(request.url).searchParams.get("c") ?? "";
  const lines = await webChatThread(id);
  return lines ? Response.json({ lines }) : Response.json({ error: "No such chat." }, { status: 404 });
}

const tooBig = () => Response.json({ error: "That message is too long." }, { status: 413 });

/** The body as text, refusing anything over WEB_CHAT_MAX_BODY_BYTES before it is all read or parsed. */
async function readCapped(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > WEB_CHAT_MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > WEB_CHAT_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  if (!FRONT_DESK_ENABLED || !isLocalRequest(request)) return notHere();
  if (!isSameOrigin(request)) return Response.json({ error: "Website chat requests must come from this page." }, { status: 403 });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Send the message as JSON." }, { status: 415 });
  }
  const raw = await readCapped(request);
  if (raw === null) return tooBig();
  let b: { conversation?: unknown; text?: unknown } = {};
  try {
    b = (JSON.parse(raw) ?? {}) as typeof b;
  } catch {
    b = {};
  }
  if (typeof b.text !== "string") return Response.json({ error: "Type a message first." }, { status: 400 });
  try {
    return Response.json(
      await webChatMessage({
        conversation: typeof b.conversation === "string" ? b.conversation : null,
        text: b.text,
        ip: webChatClientIp(request),
      }),
    );
  } catch (e) {
    if (e instanceof WebChatError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
