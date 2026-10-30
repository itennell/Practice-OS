// What every studio route that changes something checks first: the clinician (or
// the admin password on the Vercel copy), the same origin, and a JSON body.
import { canDecide } from "../admin-guard";
import { isSameOrigin } from "../connect/local-only";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A refusal to send back, or null when the request may change things. */
export function refuse(request: Request): Response | null {
  if (!canDecide(request) || !isSameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  }
  return null;
}

export const BY = "aeon:studio";
