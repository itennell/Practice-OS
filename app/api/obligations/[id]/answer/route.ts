import { canDecide } from "@/lib/admin-guard";
import { ANSWERS, answerSetup, type Answer } from "@/lib/compliance/answers";
import { isUuid } from "../../../approvals/responses";

// Her answer to a "Did you set this up?" reminder: done, not_yet or not_applicable.
export async function POST(request: Request, ctx: RouteContext<"/api/obligations/[id]/answer">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown item." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { answer?: unknown };
  if (!ANSWERS.includes(body.answer as Answer)) {
    return Response.json({ error: "Answer must be done, not_yet or not_applicable." }, { status: 400 });
  }
  const result = await answerSetup(id, body.answer as Answer);
  if (!result.ok) {
    return Response.json(
      { error: result.reason === "not_found" ? "Unknown item." : "Only setup reminders take an answer." },
      { status: result.reason === "not_found" ? 404 : 400 },
    );
  }
  return Response.json(result);
}
