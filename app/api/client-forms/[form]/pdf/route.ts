import { getForm, renderForm } from "@/lib/client-forms";
import { loadFacts, loadOverrides } from "@/lib/client-forms/store";
import { isFormId } from "@/lib/client-forms/types";

// One client form template as a PDF: her practice facts and saved wording filled
// in, every client box blank. The request carries no client details and nothing
// is written, so a plain GET is enough (the chat card links straight to it).
export async function GET(request: Request, ctx: RouteContext<"/api/client-forms/[form]/pdf">) {
  const { form } = await ctx.params;
  const def = isFormId(form) ? getForm(form) : undefined;
  if (!def) return Response.json({ error: "Unknown form." }, { status: 404 });
  const loaded = await loadFacts();
  if (!loaded) return Response.json({ error: "Add your practice details on Admin › Credentialing first." }, { status: 409 });
  const bytes = await renderForm(def, loaded.facts, await loadOverrides(def.id));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // ?inline=1 opens it in the browser's PDF viewer, to print.
      "Content-Disposition": `${new URL(request.url).searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${def.id.replace(/_/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
