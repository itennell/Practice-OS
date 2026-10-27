import { connection } from "next/server";
import { canDecide } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";
import { loadCredentialingProfile } from "@/lib/credentialing/store";
import { fillCms855i } from "@/lib/payers/cms855i";

// Medicare's CMS-855I, prepared from her credentialing profile. She finishes,
// signs and submits it (or uses PECOS); Aeon never does.
export async function GET(request: Request) {
  await connection(); // read the profile per request, never at build time
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const profile = await loadCredentialingProfile();
  if (!profile) return Response.json({ error: "Set up your credentialing profile first." }, { status: 409 });
  const r = await fillCms855i(profile);
  await audit({ actor: "aeon", action: "payer_form_prepared", subjectType: "payer_form", details: { form: "cms855i", filled: r.filled.length } });
  return new Response(Buffer.from(r.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="CMS-855I-prepared${profile.isSample ? "-SAMPLE" : ""}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
