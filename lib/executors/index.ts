import { aeonAction } from "./aeon_action";
import { gfeIssue } from "./gfe_issue";
import { stateRules } from "./state_rules";
import { testNote } from "./test_note";
import type { Executor } from "./types";
// Front Desk
import { consultBooking } from "./consult_booking";
import { consultCancel } from "./consult_cancel";
import { consultReschedule } from "./consult_reschedule";
import { smsReply } from "./sms_reply";
import { textConsultOptions } from "./text_consult_options";

// One executor per approval kind. A kind missing here fails with a clear error.
export const executors: Partial<Record<string, Executor>> = {
  test_note: testNote,
  state_rules: stateRules,
  gfe_issue: gfeIssue,
  aeon_action: aeonAction,
  // Front Desk
  text_consult_options: textConsultOptions,
  sms_reply: smsReply,
  consult_booking: consultBooking,
  consult_reschedule: consultReschedule,
  consult_cancel: consultCancel,
};

// The payload field the clinician may edit before approving, per kind.
export const editableField: Partial<Record<string, string>> = {
  test_note: "note",
};
