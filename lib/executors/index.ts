import { stateRules } from "./state_rules";
import { testNote } from "./test_note";
import type { Executor } from "./types";

// One executor per approval kind. A kind missing here fails with a clear error.
export const executors: Partial<Record<string, Executor>> = {
  test_note: testNote,
  state_rules: stateRules,
};

// The payload field the clinician may edit before approving, per kind.
export const editableField: Partial<Record<string, string>> = {
  test_note: "note",
};
