// What the Instagram helper takes from the Connect layer (lib/connect,
// desktop-app): a working token and one-hour picture hosting on the relay.
import { deletePostImage, getAccessToken, NeedsConnectError, uploadPostImage } from "../connect";
import { SCOPES } from "./graph";

export { deletePostImage, NeedsConnectError, uploadPostImage };
export type HostedImage = { url: string; expiresAt: string };

export function getInstagramToken(): Promise<string> {
  return getAccessToken("instagram", [...SCOPES]);
}
