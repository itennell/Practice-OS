import { canChange } from "@/lib/referrals/http";
import { setTypedEmail } from "@/lib/referrals/evidence/store";
import { getSource } from "@/lib/referrals/store";
import { isUuid } from "../../../approvals/responses";

// She typed the email she uses for this referral source (or cleared it).
// Hers always wins over what Aeon found.
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/email">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email && !/^[^\s@<>"]{1,64}@[^\s@<>"]+\.[A-Za-z]{2,}$/.test(email)) {
    return Response.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }
  if (!(await getSource(id))) return Response.json({ error: "Unknown card." }, { status: 404 });
  const evidence = await setTypedEmail(id, email || null);
  return Response.json({ evidence, card: await getSource(id) });
}
