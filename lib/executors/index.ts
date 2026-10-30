import { aeonAction } from "./aeon_action";
import { fileDocument } from "./file_document";
import { gfeIssue } from "./gfe_issue";
import { referralLetter } from "./referral_letter";
import { instagramPost } from "./instagram_post";
import { stateRules } from "./state_rules";
import { testNote } from "./test_note";
import type { Executor } from "./types";
// Front Desk
import { consultBooking } from "./consult_booking";
import { consultCancel } from "./consult_cancel";
import { consultReschedule } from "./consult_reschedule";
import { smsReply } from "./sms_reply";
import { textConsultOptions } from "./text_consult_options";
import { webChatReply } from "./web_chat_reply";

// One executor per approval kind. A kind missing here fails with a clear error.
export const executors: Partial<Record<string, Executor>> = {
  test_note: testNote,
  state_rules: stateRules,
  gfe_issue: gfeIssue,
  file_document: fileDocument,
  aeon_action: aeonAction,
  referral_letter: referralLetter,
  instagram_post: instagramPost,
  // Front Desk
  text_consult_options: textConsultOptions,
  sms_reply: smsReply,
  consult_booking: consultBooking,
  consult_reschedule: consultReschedule,
  consult_cancel: consultCancel,
  web_chat_reply: webChatReply,
};

// The payload field the clinician may edit before approving, per kind.
export const editableField: Partial<Record<string, string>> = {
  test_note: "note",
  referral_letter: "letter",
  web_chat_reply: "body",
};
