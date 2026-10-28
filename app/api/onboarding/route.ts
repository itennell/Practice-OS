import { ZodError, z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { AnswerError, loadOnboarding, markSkipped, saveAnswers } from "@/lib/onboarding/store";
import { checkAnswers } from "./safety";

// Aeon's onboarding interview. GET: the questions that apply to her, where she is and
// what's already saved. POST: one answer (or Skip / Set up later), saved as she goes.

export async function GET() {
  return Response.json(await loadOnboarding(), { headers: { "Cache-Control": "no-store" } });
}

const body = z.union([
  z.object({ answers: z.record(z.string().min(1).max(80), z.unknown()), current: z.string().max(80).nullable().optional() }).strict(),
  z.object({ skip: z.string().min(1).max(80), how: z.enum(["skip", "later"]), current: z.string().max(80).nullable().optional() }).strict(),
]);

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "This demo copy is view only." }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Something went wrong. Please try again." }, { status: 400 });
  try {
    if ("skip" in parsed.data) {
      return Response.json({ ok: true, state: await markSkipped(parsed.data.skip, parsed.data.how, parsed.data.current ?? null) });
    }
    const check = await checkAnswers(parsed.data.answers);
    if (!check.ok) return Response.json(check.body, { status: check.status });
    const result = await saveAnswers(parsed.data.answers, { current: parsed.data.current });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const error =
      err instanceof ZodError ? (err.issues[0]?.message ?? "Please check your answer.") : err instanceof AnswerError ? err.message : null;
    if (!error) console.error(`[onboarding] ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: error ?? "I couldn't save that. Please try again." }, { status: 400 });
  }
}
