import { connection } from "next/server";
import { db } from "@/lib/db";

// Whether her referrals calendar (practice_os.referral_meetings, GET /api/referrals/meetings) is
// installed yet, so the Overview and Meetings tabs only ask it for meetings when it is there
// (no 404 in the browser console before the calendar ships).
export async function GET() {
  await connection(); // read the database per request, never at build time
  const [row] = await db()<{ ready: boolean }[]>`select to_regclass('practice_os.referral_meetings') is not null as ready`.catch(() => [{ ready: false }]);
  return Response.json({ ready: Boolean(row?.ready) }, { headers: { "Cache-Control": "no-store" } });
}
