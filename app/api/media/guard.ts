import { canDecide } from "@/lib/admin-guard";
import { isSameOrigin } from "@/lib/connect/local-only";

/** Media writes only save on her own computer (or with the admin password); nothing is sent anywhere. */
export function refuse(request: Request): Response | null {
  if (!canDecide(request) || !isSameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  }
  return null;
}

export function failed(err: unknown, fallback: string): Response {
  const message = err instanceof Error && err.name !== "ZodError" ? err.message : fallback;
  return Response.json({ error: message }, { status: err instanceof Error && err.name === "AnswerRefused" ? 422 : 400 });
}
