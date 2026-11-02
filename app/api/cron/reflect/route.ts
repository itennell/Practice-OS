import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { sweepIdle, tidyUp } from "@/lib/aeon/reflect";
import { purgeWebChatsIfDue } from "@/lib/frontdesk/webchat-retention";

// Aeon's daily reflection pass (vercel.json crons). Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; anything else is refused. Reflects
// every quiet conversation not yet reflected, then tidies memory (merges
// look-alike notes, retires stale ones), and deletes website chats past their
// 30 days. Counts only in the reply, never text.
export const maxDuration = 300;

function fromCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization");
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  await connection();
  if (!fromCron(request)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const sweep = await sweepIdle({ limit: 10 }).catch((err) => {
    console.error(`[reflect] cron sweep: ${err instanceof Error ? err.message : String(err)}`);
    return { reflected: 0, failed: 1 };
  });
  const tidy = await tidyUp().catch((err) => {
    console.error(`[reflect] cron tidy: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });
  const purged = await purgeWebChatsIfDue(new Date(), { force: true }); // logs its own failures
  return Response.json(
    { purgedWebChats: purged, reflected: sweep.reflected, failed: sweep.failed, tidied: tidy?.status === "done" ? tidy.counts : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
