import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { connectSpruce, connectTwilio, disconnectPhone, refreshTwilioGreeting, turnOnTwilioVoicemail, undoTwilioVoicemail } from "@/lib/frontdesk/connect";

const Body = z.discriminatedUnion("vendor", [
  z.object({ vendor: z.literal("spruce"), token: z.string().min(1).max(4000) }),
  z.object({ vendor: z.literal("twilio"), accountSid: z.string().min(1).max(100), authToken: z.string().min(1).max(200), numberSid: z.string().max(100).optional() }),
  z.object({ vendor: z.literal("twilio-greeting") }),
  z.object({ vendor: z.literal("twilio-voicemail-on") }),
  z.object({ vendor: z.literal("twilio-voicemail-undo") }),
]);

// The phone Connect card: paste the keys (Twilio) or token (Spruce), live check, then save.
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, fix: "Paste your keys first." }, { status: 400 });
  const b = parsed.data;
  const result =
    b.vendor === "spruce"
      ? await connectSpruce(b.token)
      : b.vendor === "twilio"
        ? await connectTwilio(b)
        : b.vendor === "twilio-voicemail-on"
          ? await turnOnTwilioVoicemail()
          : b.vendor === "twilio-voicemail-undo"
            ? await undoTwilioVoicemail()
            : await refreshTwilioGreeting();
  return Response.json(result, { status: result.ok ? 200 : 422 });
}

export async function DELETE(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  await disconnectPhone();
  return Response.json({ ok: true });
}
