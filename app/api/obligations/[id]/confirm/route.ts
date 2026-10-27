import { canDecide } from "@/lib/admin-guard";
import { confirmRule } from "@/lib/compliance/researched";
import { syncCalendar } from "@/lib/compliance/store";
import { db } from "@/lib/db";
import { isUuid } from "../../../approvals/responses";

// She checked a researched rule with her board: it becomes hers and the badge goes away.
export async function POST(request: Request, ctx: RouteContext<"/api/obligations/[id]/confirm">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown item." }, { status: 404 });

  const [row] = await db()`select rule_id from practice_os.obligations where id = ${id}`;
  if (!row?.rule_id) return Response.json({ error: "Unknown item." }, { status: 404 });
  const result = await confirmRule(row.rule_id);
  if (!result.ok) {
    const error = {
      not_found: "Unknown rule.",
      not_researched: "This rule was verified by the Practice-OS maintainers; there's nothing to confirm.",
      already_confirmed: "You already confirmed this rule.",
    }[result.reason];
    return Response.json({ error }, { status: result.reason === "already_confirmed" ? 409 : 400 });
  }
  await syncCalendar();
  return Response.json(result);
}
