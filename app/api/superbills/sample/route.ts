import { DANA_PROFILE } from "@/lib/credentialing/demo";
import { sampleSuperbill } from "@/lib/superbill/demo";
import { renderSuperbillPdf } from "@/lib/superbill/pdf";

// The [Sample] superbill as a PDF, with the client boxes blank. Read-only.
export async function GET() {
  const bytes = await renderSuperbillPdf(sampleSuperbill(), DANA_PROFILE, "2026-10-27");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="superbill-sample.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
