import { getForm, prepare, renderForm } from "@/lib/client-forms";
import { loadFacts, loadOverrides } from "@/lib/client-forms/store";
import { isFormId } from "@/lib/client-forms/types";

// One client form template as a PDF: her practice facts and saved wording filled
// in, every client box blank. The request carries no client details and nothing
// is written, so a plain GET is enough (the chat card links straight to it).
// Before rendering, the same check as the library runs on the text that would
// print: a missing required element, a gap still marked [fill in], policies never
// saved, or a practice outside Illinois gets a plain message instead of a PDF.

/** A short page the browser shows as-is when the download link is clicked. */
const plain = (text: string, status: number) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request: Request, ctx: RouteContext<"/api/client-forms/[form]/pdf">) {
  const { form } = await ctx.params;
  const def = isFormId(form) ? getForm(form) : undefined;
  if (!def) return plain("There is no such client form.", 404);
  const loaded = await loadFacts();
  if (!loaded) return plain("Add your practice details on Admin › Credentialing first.", 409);
  const overrides = await loadOverrides(def.id);
  const { blockers } = prepare(def, loaded.facts, overrides);
  if (blockers.length) return plain(`${def.title} can't be downloaded yet.\n\n${blockers.join("\n\n")}`, 409);
  const bytes = await renderForm(def, loaded.facts, overrides);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // ?inline=1 opens it in the browser's PDF viewer, to print.
      "Content-Disposition": `${new URL(request.url).searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${def.id.replace(/_/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
