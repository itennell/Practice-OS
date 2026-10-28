// What the Instagram helper takes from the Connect layer (lib/connect,
// desktop-app): a working token and one-hour picture hosting on the relay.
import { getAccessToken, NeedsConnectError, uploadPostImage } from "../connect";
import { SCOPES } from "./graph";

export { NeedsConnectError, uploadPostImage };
export type HostedImage = { url: string; expiresAt: string };

export function getInstagramToken(): Promise<string> {
  return getAccessToken("instagram", [...SCOPES]);
}
