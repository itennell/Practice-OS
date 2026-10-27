// Thought Line (UI-014) task list rules, kept free of React so they can be unit tested.

export type StepStatus = "pending" | "running" | "done" | "failed";

/** One task in Aeon's task box. `detail` is a short line of what it found or did. */
export type ThoughtStep = { label: string; detail?: string; status?: StepStatus };

/** A task with its status worked out. */
export type NormalStep = { label: string; detail?: string; status: StepStatus };

/**
 * Plain strings are past work plus the current step: all done except the
 * last, which is running while Aeon works. Objects say their own status;
 * without one they follow the same rule. When work ends, nothing is left
 * running or waiting: those become done unless already failed.
 */
export function normalizeSteps(steps: (string | ThoughtStep)[], working: boolean): NormalStep[] {
  return steps.map((s, i) => {
    const step = typeof s === "string" ? { label: s } : s;
    const implied: StepStatus = working && i === steps.length - 1 ? "running" : "done";
    let status = step.status ?? implied;
    if (!working && (status === "running" || status === "pending")) status = "done";
    return { label: step.label, detail: step.detail, status };
  });
}

/** Screen-reader word for each status. */
export const STEP_WORDS: Record<StepStatus, string> = {
  pending: "coming up",
  running: "in progress",
  done: "done",
  failed: "didn't work",
};
