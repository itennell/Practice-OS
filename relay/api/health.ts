import { relayHealth } from "../lib/health";

export function GET() {
  return Response.json(relayHealth(process.env), { headers: { "cache-control": "no-store" } });
}
