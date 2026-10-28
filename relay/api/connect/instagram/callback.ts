import { callback } from "../../../lib/handlers";
import { outside, relayEnv } from "../../../lib/env";

export function GET(request: Request) {
  return callback(request, relayEnv(), outside);
}
