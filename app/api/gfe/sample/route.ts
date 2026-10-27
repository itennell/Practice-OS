import { sampleGfe } from "@/lib/gfe/demo";
import { renderGfePdf } from "@/lib/gfe/pdf";

// The [Sample] Good Faith Estimate as a PDF. Read-only: nothing is sent.
export async function GET() {
  const bytes = await renderGfePdf(sampleGfe());
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="good-faith-estimate-sample.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
