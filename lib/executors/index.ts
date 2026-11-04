import { aeonAction } from "./aeon_action";
import { fileDocument } from "./file_document";
import { gfeIssue } from "./gfe_issue";
import { referralLetter } from "./referral_letter";
import { referralMeeting } from "./referral_meeting";
import { stateRules } from "./state_rules";
import { testNote } from "./test_note";
import type { Executor } from "./types";

// One executor per approval kind. A kind missing here fails with a clear error.
export const executors: Partial<Record<string, Executor>> = {
  test_note: testNote,
  state_rules: stateRules,
  gfe_issue: gfeIssue,
  file_document: fileDocument,
  aeon_action: aeonAction,
  referral_letter: referralLetter,
  referral_meeting: referralMeeting,
};

// The payload field the clinician may edit before approving, per kind.
export const editableField: Partial<Record<string, string>> = {
  test_note: "note",
  referral_letter: "letter",
};
