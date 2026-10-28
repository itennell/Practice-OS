import { begin } from "../../../lib/handlers";
import { outside, relayEnv } from "../../../lib/env";

export function POST(request: Request) {
  return begin(request, relayEnv(), outside);
}
