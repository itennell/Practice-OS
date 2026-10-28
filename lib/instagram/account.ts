import { getConnection } from "../connections";
import { InstagramApiError, InstagramGraph, type Fetch } from "./graph";
import { getInstagramToken, NeedsConnectError } from "./relay";

// The Instagram card's live check: ask Instagram who the stored token belongs
// to. Sign-in, storage and refresh belong to lib/connect (desktop-app).

export type LiveCheck =
  | { state: "not_connected" }
  | { state: "connected"; username: string }
  | { state: "needs_reconnect"; reason: string }
  | { state: "unreachable"; reason: string };

export async function liveCheck(fetchImpl?: Fetch): Promise<LiveCheck> {
  let token: string;
  try {
    token = await getInstagramToken();
  } catch (err) {
    if (err instanceof NeedsConnectError) {
      return (await getConnection("instagram"))?.accessToken
        ? { state: "needs_reconnect", reason: "The Instagram sign-in ran out. Press Connect again." }
        : { state: "not_connected" };
    }
    throw err;
  }
  try {
    const me = await new InstagramGraph(token, fetchImpl).me();
    return { state: "connected", username: me.username };
  } catch (err) {
    if (err instanceof InstagramApiError && err.tokenInvalid) {
      return { state: "needs_reconnect", reason: "Instagram no longer accepts this sign-in. Press Connect again." };
    }
    return { state: "unreachable", reason: "Couldn't reach Instagram. Check the internet connection and try again." };
  }
}

/** Token plus the Instagram user id, asked of Instagram each time so nothing extra is stored. */
export async function instagramAccount(fetchImpl?: Fetch) {
  const token = await getInstagramToken();
  const me = await new InstagramGraph(token, fetchImpl).me();
  return { token, igUserId: me.user_id, username: me.username };
}
