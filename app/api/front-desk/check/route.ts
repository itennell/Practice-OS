import { canDecide } from "@/lib/admin-guard";
import { checkFrontDesk } from "@/lib/frontdesk/check";
import { calendarStatus, phoneStatus } from "@/lib/frontdesk/connect";

// GET: live status of her phone company and calendar (the Connect cards).
// POST: "Check now" on the Front Desk page; the same check the app runs every minute.
export async function GET() {
  const [phone, calendar] = await Promise.all([phoneStatus(), calendarStatus()]);
  return Response.json({ phone, calendar });
}

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  return Response.json(await checkFrontDesk());
}
