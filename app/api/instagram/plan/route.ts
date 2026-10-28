import { canDecide } from "@/lib/admin-guard";
import { planWeek } from "@/lib/instagram/store";

// Plan this week: five drafts, each checked, drawn and waiting for her approval.
// Takes a few minutes (three model calls per post); nothing is posted here.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  try {
    return Response.json(await planWeek("aeon:instagram"));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Aeon couldn't plan the posts. Try again." }, { status: 502 });
  }
}
