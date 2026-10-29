import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";
import { AnswerRefused } from "@/lib/media/facts";

/** Media writes only save on her own computer (or with the admin password); nothing is sent anywhere. */
export function refuse(request: Request): Response | null {
  if (!canDecide(request) || !isSameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  }
  return null;
}

/** Only Aeon's own refusals (AnswerRefused) show their words; anything else gets the plain fallback. */
export function failed(err: unknown, fallback: string, status = 400): Response {
  if (err instanceof AnswerRefused) return Response.json({ error: err.message }, { status: 422 });
  console.error(`[media] ${err instanceof Error ? err.message : String(err)}`);
  return Response.json({ error: fallback }, { status });
}
