// Whether the Instagram card offers Connect, in plain code so every state is
// tested. One rule for every state that isn't a working sign-in (never
// connected, ran out, needs reconnect, unreachable): if this copy's relay is
// known not to be ready, say so instead of offering a button that dead-ends.

export type CardCheckState = "checking" | "connected" | "not_connected" | "needs_reconnect" | "unreachable";

export function instagramConnectView(state: CardCheckState, notReady?: string): { showConnect: boolean; notReady?: string } {
  if (state === "checking" || state === "connected") return { showConnect: false };
  if (notReady) return { showConnect: false, notReady };
  return { showConnect: true };
}
