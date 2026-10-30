import { z, ZodError } from "zod";
import { refuse, failed } from "../guard";
import { loadMediaFacts } from "@/lib/media/facts";
import { loadProfileDraft } from "@/lib/media/profile";
import { buildProfileView, interviewState, resetInterview, saveStep } from "@/lib/media/pt-profile";

// The Psychology Today interview (Media > Directories): one answer, a skip, a Back
// (`at`), or starting over. Each typed answer is checked before it is saved; the
// reply carries the next question and the whole profile as it now reads.
const body = z
  .object({
    step: z.string().max(40).optional(),
    value: z.unknown().optional(),
    skip: z.boolean().optional(),
    at: z.string().max(40).optional(),
    reset: z.boolean().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const no = refuse(request);
  if (no) return no;
  try {
    const b = body.parse(await request.json());
    let f = await loadMediaFacts();
    if (b.reset) f = await resetInterview(f);
    else if (b.step) f = await saveStep(f, b.step, { value: b.value, skip: b.skip });
    return Response.json({ state: interviewState(f, b.at), view: buildProfileView(f, await loadProfileDraft()) });
  } catch (err) {
    if (err instanceof ZodError) return Response.json({ error: err.issues[0]?.message ?? "Please check your answer." }, { status: 400 });
    return failed(err, "Couldn't save that. Try again.");
  }
}
