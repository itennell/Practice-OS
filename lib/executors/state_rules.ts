import { audit } from "../audit";
import { saveStateRules, type StateRulesPayload } from "../compliance/researched";
import { practiceToday, syncCalendar } from "../compliance/store";
import type { Executor } from "./types";

// Saves the state rules Muse researched once she approves the batch, then
// rebuilds her calendar. It acts only inside our own database, so it runs the
// same with or without DRY_RUN. Each rule is re-checked before it is saved.
export const stateRules: Executor = async (approval, { dryRun }) => {
  const payload = approval.payload as unknown as StateRulesPayload;
  if (!Array.isArray(payload.rules)) throw new Error("This approval has no rules to save.");
  const { saved, refused } = await saveStateRules(approval.id, payload, await practiceToday());
  const rebuilt = await syncCalendar();
  await audit({
    actor: "executor",
    action: "state_rules_saved",
    approvalId: approval.id,
    subjectType: "state_rules",
    details: { state: payload.state, saved, refused, dryRun },
  });
  return { saved: saved.length, refused, calendar_rows: rebuilt.written };
};
