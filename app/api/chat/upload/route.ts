import { isLocalAppRequest } from "@/lib/request-guard";
import { getConversation, saveExchange } from "@/lib/aeon/chat";
import { fileUpload } from "@/lib/uploads/file";
import { MAX_BYTES } from "@/lib/uploads/read";
import { isUuid } from "../../approvals/responses";

// A file she adds in the chat box. Only on her own computer: the file is kept in
// her data folder, never on the Vercel copy. Every check runs before any model
// call (lib/uploads/file.ts). A refused file is answered and saved nowhere; an
// accepted one is saved in the chat as "Added a document" (never her filename,
// which could name a client) with Aeon's answer and the document's card.
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isLocalAppRequest(request)) return Response.json({ error: "Adding files works in Practice-OS on your own computer." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const conversationId = form?.get("conversationId");
  if (!(file instanceof Blob) || file.size === 0) return Response.json({ error: "No file was sent." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is over 10 MB. Send a smaller copy." }, { status: 413 });
  const chatId = typeof conversationId === "string" && conversationId ? conversationId : null;
  if (chatId && (!isUuid(chatId) || !(await getConversation(chatId)))) return Response.json({ error: "That conversation no longer exists." }, { status: 404 });

  try {
    const outcome = await fileUpload(new Uint8Array(await file.arrayBuffer()), { by: `chat:${chatId ?? "new"}` });
    if (!outcome.ok) return Response.json({ conversationId: chatId, reply: { kind: "file_refused", reason: outcome.reason, text: outcome.text } });
    const reply = {
      kind: "answer" as const,
      text: outcome.text,
      steps: [{ tool: "file_upload", label: "Read and kept your document", ms: 0, ok: true, documents: [outcome.card] }],
      approvalIds: outcome.approvalId ? [outcome.approvalId] : [],
    };
    const saved = await saveExchange({ conversationId: chatId, text: "Added a document", reply });
    return Response.json({ conversationId: saved, reply }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(`[upload] ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "Aeon couldn't read that file just now. Try again in a minute." }, { status: 502 });
  }
}
