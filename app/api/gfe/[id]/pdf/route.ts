import { canDecide } from "@/lib/admin-guard";
import { practiceToday } from "@/lib/compliance/store";
import { clientIdentitySchema } from "@/lib/gfe/identity";
import { renderGfePdf } from "@/lib/gfe/pdf";
import { loadCredentialingProfile } from "@/lib/credentialing/store";
import { MissingProviderDetails, getEstimate, toGoodFaithEstimate } from "@/lib/gfe/store";
import { isUuid } from "../../../approvals/responses";

// Makes the PDF for a saved estimate with the client details she types. Those
// details live only in this request: nothing is written to the database, the
// audit log or the server log. Before approval the PDF says DRAFT on every page.
export async function POST(request: Request, ctx: RouteContext<"/api/gfe/[id]/pdf">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown estimate." }, { status: 404 });
  const estimate = await getEstimate(id);
  if (!estimate) return Response.json({ error: "Unknown estimate." }, { status: 404 });

  const parsed = clientIdentitySchema.safeParse(await request.json().catch(() => null));
  // Field names only: never echo what she typed.
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "form"))];
    return Response.json({ error: `Check these fields: ${fields.join(", ")}.` }, { status: 400 });
  }

  const profile = await loadCredentialingProfile();
  try {
    if (!profile) throw new MissingProviderDetails();
    const issuedOn = estimate.issued_on ?? (await practiceToday());
    const bytes = await renderGfePdf(toGoodFaithEstimate(estimate, parsed.data, issuedOn, profile));
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${estimate.reference}${estimate.issued_on ? "" : "-DRAFT"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof MissingProviderDetails) return Response.json({ error: err.message }, { status: 409 });
    return Response.json({ error: "Couldn't make the PDF. Check the details and try again." }, { status: 400 });
  }
}
