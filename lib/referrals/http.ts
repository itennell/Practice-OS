import { canDecide } from "../admin-guard";
import { isLocalAppRequest, isSameOrigin } from "../request-guard";

/**
 * Who may change the Referrals board: the app's own page on her computer, as
 * JSON (so a plain form or text/plain post from another site can't), or on the
 * Vercel copy someone with the admin password from the app's own page.
 * proxy.ts already refuses other hosts and cross-site changes; this is the
 * route's own check, the same as onboarding's.
 */
export function canChange(request: Request): boolean {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return false;
  if (process.env.VERCEL) return canDecide(request) && isSameOrigin(request);
  return isLocalAppRequest(request);
}
