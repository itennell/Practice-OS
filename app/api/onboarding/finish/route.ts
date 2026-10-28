import { after } from "next/server";
import { canDecide } from "@/lib/admin-guard";
import { runResearch } from "@/lib/compliance/actions";
import { AnswerError, finishOnboarding } from "@/lib/onboarding/store";

// Finishing the interview. A state other than Illinois starts Aeon's state research
// after the reply; its rules come back as one pending approval (AGENTS.md > Admin).
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "This demo copy is view only." }, { status: 403 });
  try {
    const { researchState } = await finishOnboarding();
    if (researchState && process.env.MODEL_API_KEY) {
      after(() =>
        runResearch(undefined, "onboarding").catch((err) => console.error(`[onboarding research] ${err instanceof Error ? err.message : String(err)}`)),
      );
    }
    return Response.json({ ok: true, researching: Boolean(researchState && process.env.MODEL_API_KEY) });
  } catch (err) {
    return Response.json({ error: err instanceof AnswerError ? err.message : "I couldn't finish just now. Please try again." }, { status: 400 });
  }
}
