import { practiceToday } from "@/lib/compliance/store";
import { loadCredentialingProfile } from "@/lib/credentialing/store";
import { MissingProviderDetails, renderSuperbillPdf } from "@/lib/superbill/pdf";
import { getSuperbill } from "@/lib/superbill/store";
import { isUuid } from "../../../approvals/responses";

// The superbill PDF: the practice side filled in, the client side blank boxes
// she fills in on her own computer. The request carries no client details, so
// a plain GET is enough; nothing is written.
export async function GET(_request: Request, ctx: RouteContext<"/api/superbills/[id]/pdf">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown superbill." }, { status: 404 });
  const [sb, profile, today] = await Promise.all([getSuperbill(id), loadCredentialingProfile(), practiceToday()]);
  if (!sb) return Response.json({ error: "Unknown superbill." }, { status: 404 });
  try {
    if (!profile) throw new MissingProviderDetails();
    const bytes = await renderSuperbillPdf(sb, profile, sb.created_at instanceof Date ? sb.created_at.toISOString().slice(0, 10) : today);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sb.reference}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof MissingProviderDetails) return Response.json({ error: err.message }, { status: 409 });
    return Response.json({ error: "Couldn't make the PDF." }, { status: 500 });
  }
}
