import { isLocalRequest } from "@/lib/request-guard";
import { getStoredDocument, readStoredFile } from "@/lib/uploads/store";
import { isUuid } from "../../../approvals/responses";

// A document she added in the chat, from her data folder. Only on her own computer.
// ?download=1 saves it; otherwise it opens in the browser (PDF and text).
export async function GET(request: Request, { params }: RouteContext<"/api/documents/[id]/file">) {
  if (!isLocalRequest(request)) return Response.json({ error: "Your documents are on your own computer." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "No such document." }, { status: 404 });
  const doc = await getStoredDocument(id);
  const bytes = doc ? await readStoredFile(doc) : null;
  if (!doc || !bytes) return Response.json({ error: "That document isn't on this computer." }, { status: 404 });
  const ext = doc.stored_as.split(".").pop();
  const name = `${doc.title.replace(/[^A-Za-z0-9 ._-]/g, "").trim().slice(0, 60) || "document"}.${ext}`;
  const download = new URL(request.url).searchParams.get("download") === "1" || doc.mime !== "application/pdf";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mime === "text/plain" ? "text/plain; charset=utf-8" : doc.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
