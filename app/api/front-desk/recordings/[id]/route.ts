import { deps } from "@/lib/frontdesk/deps";
import { voicemailRecording } from "@/lib/frontdesk/inbox";
import { PhoneError } from "@/lib/frontdesk/phone/types";
import { isLocalRequest } from "@/lib/request-guard";

// Plays one voicemail in the Front Desk inbox. The audio comes from her phone
// company each time (nothing is kept on disk) and only on her own computer:
// the browser never sees the phone company's keys, and the Vercel copy says no.
export async function GET(request: Request, ctx: RouteContext<"/api/front-desk/recordings/[id]">) {
  if (!isLocalRequest(request)) return Response.json({ error: "Voicemails play only on your own computer." }, { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown voicemail." }, { status: 404 });
  const rec = await voicemailRecording(id);
  const phone = await deps().phone();
  if (!rec || !phone?.recording || phone.vendor !== rec.vendor) return Response.json({ error: "This voicemail has no recording to play." }, { status: 404 });
  try {
    const audio = await phone.recording(rec.sid);
    return new Response(new Uint8Array(audio.bytes), { headers: { "Content-Type": audio.mime, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof PhoneError ? e.fix : "Couldn't get the recording." }, { status: 502 });
  }
}
