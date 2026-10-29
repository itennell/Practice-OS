import { refuse, failed } from "../guard";
import { AnswerRefused, saveMediaAnswers } from "@/lib/media/facts";
import { ZodError } from "zod";

// Her answers in her own words (Media > Psychology Today). Each one goes through
// the crisis check and the client-detail guard before it is saved.
export async function POST(request: Request) {
  const no = refuse(request);
  if (no) return no;
  try {
    return Response.json({ answers: await saveMediaAnswers(await request.json()) });
  } catch (err) {
    if (err instanceof ZodError) return Response.json({ error: err.issues[0]?.message ?? "Please check your answers." }, { status: 400 });
    if (err instanceof AnswerRefused) return Response.json({ error: err.message }, { status: 422 });
    return failed(err, "Couldn't save your answers. Try again.");
  }
}
