import { practiceToday } from "@/lib/compliance/store";
import { loadCredentialingProfile } from "@/lib/credentialing/store";
import { getReleaseDraft } from "@/lib/release/drafts";
import { checkReleaseFields } from "@/lib/release/fields";
import { renderReleaseForm, renderRevocationForm } from "@/lib/release/pdf";

// Illinois release forms. GET ?kind=blank|revocation gives a blank form; GET
// ?draft=<id> gives the one Aeon filled in the chat (its boxes wait in memory for
// 30 minutes, lib/release/drafts.ts), so the chat card can link to it; POST
// with recipient, purpose, what to release and the expiration date gives one
// with those boxes filled. Nothing is written anywhere: not the database, the
// audit log or the server log. The client's boxes are always left blank.

const NO_PROFILE = "Add your practice details on Admin > Credentialing first.";

function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const draftId = params.get("draft");
  if (draftId !== null) {
    const fields = getReleaseDraft(draftId);
    if (!fields) return Response.json({ error: "That filled form has expired. Ask Aeon to fill it again, or type it in on Admin > Release of information." }, { status: 404 });
    const profile = await loadCredentialingProfile();
    if (!profile) return Response.json({ error: NO_PROFILE }, { status: 409 });
    return pdfResponse(await renderReleaseForm(fields, profile, profile.isSample), "release-of-information.pdf");
  }
  const kind = params.get("kind");
  if (kind !== "blank" && kind !== "revocation") return Response.json({ error: "Ask for kind=blank or kind=revocation." }, { status: 400 });
  const profile = await loadCredentialingProfile();
  if (!profile) return Response.json({ error: NO_PROFILE }, { status: 409 });
  return kind === "blank"
    ? pdfResponse(await renderReleaseForm(null, profile, profile.isSample), "release-of-information-blank.pdf")
    : pdfResponse(await renderRevocationForm(profile, profile.isSample), "revocation-of-consent.pdf");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const [profile, today] = await Promise.all([loadCredentialingProfile(), practiceToday()]);
  if (!profile) return Response.json({ error: NO_PROFILE }, { status: 409 });
  try {
    const fields = checkReleaseFields(body, today);
    return pdfResponse(await renderReleaseForm(fields, profile, profile.isSample), "release-of-information.pdf");
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Check the form and try again." }, { status: 400 });
  }
}
