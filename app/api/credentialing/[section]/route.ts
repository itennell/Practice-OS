import { ZodError } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { SECTION_NAMES, sectionValues, updateCredentialingSection } from "@/lib/credentialing/store";

// Saves one section of her credentialing profile (the same function Aeon's update_credentialing tool uses).
export async function POST(request: Request, ctx: RouteContext<"/api/credentialing/[section]">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { section } = await ctx.params;
  if (!(SECTION_NAMES as string[]).includes(section)) return Response.json({ error: "Unknown section." }, { status: 404 });
  try {
    const profile = await updateCredentialingSection(section, await request.json().catch(() => null), "clinician");
    return Response.json({ section, values: sectionValues(profile)[section as keyof ReturnType<typeof sectionValues>] });
  } catch (err) {
    const error =
      err instanceof ZodError
        ? err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join(" ")
        : err instanceof Error
          ? err.message
          : "Couldn't save.";
    return Response.json({ error }, { status: 400 });
  }
}
