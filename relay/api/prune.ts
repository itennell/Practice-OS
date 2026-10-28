import { prune } from "../lib/handlers";
import { outside, relayEnv } from "../lib/env";

export function GET(request: Request) {
  return prune(request, relayEnv(), outside);
}
