import { NextResponse } from "next/server";
import { saveRedeemedToken } from "@/lib/instagram/account";
import { signInErrorText, takeState } from "@/lib/instagram/connect";
import { RelayClient, relayUrl } from "@/lib/instagram/relay";

// Electron opens practiceos://connect/instagram?handoff=H&state=S here. The
// relay already traded Meta's code for a long-lived token; this redeems it once,
// asks Instagram for the username, and stores the token encrypted.
const back = (request: Request, params: Record<string, string>) =>
  NextResponse.redirect(new URL(`/settings?${new URLSearchParams(params)}`, request.url), 303);

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const state = q.get("state") ?? "";
  if (!state || !takeState(state)) {
    return back(request, { instagram: "error", message: "That sign-in link is old or was already used. Press Connect again." });
  }
  if (q.get("error")) return back(request, { instagram: "error", message: signInErrorText(q.get("error")) });
  const handoff = q.get("handoff");
  const relay = relayUrl();
  if (!handoff || !relay) return back(request, { instagram: "error", message: signInErrorText(null) });
  try {
    const token = await new RelayClient(relay).redeem(handoff, state);
    const { username } = await saveRedeemedToken(token);
    return back(request, { instagram: "connected", username });
  } catch {
    return back(request, { instagram: "error", message: signInErrorText(null) });
  }
}
