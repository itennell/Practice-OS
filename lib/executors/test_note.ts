import { audit } from "../audit";
import type { Executor } from "./types";

// Exercises the approve flow end to end. It acts only inside our own database
// (one audit_log line), so it runs the same with or without DRY_RUN.
// payload.fail = true makes it throw, to show the failed state.
export const testNote: Executor = async (approval, { dryRun }) => {
  const note = typeof approval.payload.note === "string" ? approval.payload.note : "";
  if (approval.payload.fail === true) {
    throw new Error("Test failure requested (payload.fail is true).");
  }
  await audit({
    actor: "executor",
    action: "test_note_written",
    approvalId: approval.id,
    details: { note, dryRun },
  });
  return { wrote: "audit_log", note };
};
