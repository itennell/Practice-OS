import { after } from "next/server";
import { runResearch } from "@/lib/compliance/actions";
import { AnswerError, finishOnboarding } from "@/lib/onboarding/store";
import { canWrite } from "../safety";

// Finishing the interview. The first finish on a state other than Illinois starts
// Aeon's state research after the reply; its rules come back as one pending approval
// (AGENTS.md > Admin). Finishing again (a retry, a "Still to set up" visit) never
// starts it twice.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!canWrite(request)) return Response.json({ error: "Setup can only be finished from Practice-OS itself." }, { status: 403 });
  try {
    const { researchState } = await finishOnboarding();
    const researching = Boolean(researchState && process.env.MODEL_API_KEY);
    if (researching) {
      after(() =>
        runResearch(undefined, "onboarding").catch((err) => console.error(`[onboarding research] ${err instanceof Error ? err.message : String(err)}`)),
      );
    }
    return Response.json({ ok: true, researching });
  } catch (err) {
    return Response.json({ error: err instanceof AnswerError ? err.message : "I couldn't finish just now. Please try again." }, { status: 400 });
  }
}
