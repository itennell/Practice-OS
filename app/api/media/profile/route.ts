import { z } from "zod";
import { failed, refuse } from "../guard";
import { loadMediaFacts, missingAnswers } from "@/lib/media/facts";
import { directoryVersions, draftProfile, saveFieldEdit, saveProfileDraft } from "@/lib/media/profile";
import { LIMIT, TEXT_IDS, type PtTextId } from "@/lib/media/schema";

// Writes her Psychology Today profile (POST) or saves her change to one box (PATCH).
// Nothing leaves her computer: she copies each box and pastes it in herself.
export const maxDuration = 120;

export async function POST(request: Request) {
  const no = refuse(request);
  if (no) return no;
  try {
    const f = await loadMediaFacts();
    if (missingAnswers(f.answers).length) return Response.json({ error: "Answer the questions first, so the profile sounds like you." }, { status: 409 });
    const d = await draftProfile(f);
    await saveProfileDraft(d);
    return Response.json({ draft: d, directories: directoryVersions(d) });
  } catch (err) {
    return failed(err, "Aeon couldn't write the profile. Try again.", 502);
  }
}

const edit = z.object({ id: z.enum(TEXT_IDS as [PtTextId, ...PtTextId[]]), text: z.string().max(2000) }).strict();

export async function PATCH(request: Request) {
  const no = refuse(request);
  if (no) return no;
  const body = edit.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Please check the text." }, { status: 400 });
  const limit = LIMIT[body.data.id];
  if (body.data.text.trim().length > limit) return Response.json({ error: `This box takes ${limit} characters. Please shorten it.` }, { status: 422 });
  try {
    const field = await saveFieldEdit(body.data.id, body.data.text, await loadMediaFacts());
    return Response.json({ field });
  } catch (err) {
    return failed(err, "Couldn't save your change. Try again.");
  }
}
