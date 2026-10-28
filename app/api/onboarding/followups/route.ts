import { loadOnboarding } from "@/lib/onboarding/store";
import { writeFollowups } from "@/lib/onboarding/followups";

// muse-spark-1.3 writes 2 or 3 business questions from what she has told Aeon so far
// (lib/onboarding/followups.ts checks her words before and every question after).
export const maxDuration = 60;

export async function POST() {
  const { progress } = await loadOnboarding();
  const v = progress.values;
  const who = v.who as { chips?: string[]; work?: string[]; text?: string } | undefined;
  const summary = [
    v.license && `License: ${v.license}`,
    v.state && `State: ${v.state}`,
    v.sees_clients && `Sees clients: ${v.sees_clients}`,
    v.insurance && `Insurance: ${v.insurance}`,
    who?.chips?.length && `Works with: ${who.chips.join(", ")}`,
    who?.work?.length && `How she works: ${who.work.join(", ")}`,
    who?.text && `In her words: ${who.text}`,
  ]
    .filter(Boolean)
    .join("\n");
  return Response.json(await writeFollowups(summary), { headers: { "Cache-Control": "no-store" } });
}
