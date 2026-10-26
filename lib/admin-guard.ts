import { timingSafeEqual } from "node:crypto";

/**
 * Who may approve or decline. Locally (the clinician's own machine) anyone at
 * localhost may. On the Vercel copy (VERCEL is set) the request must carry the
 * x-admin-password header matching ADMIN_PASSWORD (AGENTS.md > Vercel copy).
 */
export function canDecide(request: Request): boolean {
  if (!process.env.VERCEL) return true;
  const expected = process.env.ADMIN_PASSWORD;
  const given = request.headers.get("x-admin-password");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
