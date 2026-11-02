import { z } from "zod";
import { failed, refuse } from "../media/guard";
import { planInputSchema } from "@/lib/growth/plan";
import { DRAFT_KINDS, draftAndQueue, loadPlan, PolicyBlocked, saveGrowth } from "@/lib/growth/store";

// Media > Grow: save her planner numbers and ad settings, or draft an ad set or her
// website and queue it for her approval. Nothing is spent, sent or published here.
export const maxDuration = 120;

const httpsOrEmpty = z.string().trim().max(300).optional();
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), plan: planInputSchema }),
  z.object({
    action: z.literal("settings"),
    monthly_cap_dollars: z.number().min(10).max(50_000).nullable().optional(),
    radius_miles: z.number().min(1).max(50).optional(),
    site_url: httpsOrEmpty,
    booking_url: httpsOrEmpty,
  }),
  z.object({ action: z.literal("draft"), kind: z.enum(DRAFT_KINDS) }),
]);

export async function POST(request: Request) {
  const no = refuse(request);
  if (no) return no;
  const b = body.safeParse(await request.json().catch(() => null));
  if (!b.success) return Response.json({ error: "Something was missing. Try again." }, { status: 400 });
  try {
    if (b.data.action === "plan") {
      await saveGrowth({ plan: b.data.plan });
      return Response.json(await loadPlan());
    }
    if (b.data.action === "settings") {
      const { monthly_cap_dollars, radius_miles, site_url, booking_url } = b.data;
      const saved = await saveGrowth({
        ...(monthly_cap_dollars !== undefined ? { monthly_cap_cents: monthly_cap_dollars === null ? null : Math.round(monthly_cap_dollars * 100) } : {}),
        ...(radius_miles !== undefined ? { radius_miles } : {}),
        ...(site_url !== undefined ? { site_url: site_url || null } : {}),
        ...(booking_url !== undefined ? { booking_url: booking_url || null } : {}),
      });
      return Response.json({ saved });
    }
    const r = await draftAndQueue(b.data.kind, "clinician:grow");
    return Response.json({ id: r.id, approvalId: r.approvalId });
  } catch (err) {
    if (err instanceof PolicyBlocked) return Response.json({ error: err.message, findings: err.findings }, { status: 422 });
    if (err instanceof z.ZodError) return Response.json({ error: err.issues.map((i) => i.message).join(" ") }, { status: 400 });
    return failed(err, "That didn't work. Try again.");
  }
}
