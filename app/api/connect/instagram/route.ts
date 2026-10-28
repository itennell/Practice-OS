import { canDecide } from "@/lib/admin-guard";
import { disconnectInstagram, liveCheck } from "@/lib/instagram/account";
import { startInstagramSignIn } from "@/lib/instagram/connect";

// The Instagram Connect card: GET is the live check, POST starts the sign-in,
// DELETE disconnects.
export async function GET() {
  try {
    return Response.json(await liveCheck());
  } catch {
    return Response.json({ state: "unreachable", reason: "Couldn't reach Instagram. Check the internet connection." });
  }
}

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const started = startInstagramSignIn();
  if (!started.ok) return Response.json({ error: started.reason }, { status: 409 });
  return Response.json({ url: started.url });
}

export async function DELETE(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  await disconnectInstagram();
  return Response.json({ state: "not_connected" });
}
