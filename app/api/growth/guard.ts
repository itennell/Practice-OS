import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";

/**
 * Grow's downloads and pictures: the same rule as its POST (app/api/media/guard.ts), minus
 * the JSON body. Only the app's own page on her computer (or the admin on the demo copy)
 * gets them; a link opened from another site is refused.
 */
export function refuseRead(request: Request): Response | null {
  if (!canDecide(request) || !isSameOrigin(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  return null;
}
