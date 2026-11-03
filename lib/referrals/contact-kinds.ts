// The kinds of contact on a Referrals card's log, for the server and the page.

export const CONTACT_KINDS = ["called", "emailed", "met", "sent_letter", "replied", "note", "referred", "referred_out"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_LABEL: Record<ContactKind, string> = {
  called: "Called",
  emailed: "Emailed",
  met: "Met",
  sent_letter: "Sent the letter",
  replied: "They replied",
  note: "Note",
  referred: "They referred someone",
  referred_out: "You referred someone to them",
};

/** Kinds she picks in the log form; referred_out is logged by the refer-out step with a count. */
export const LOGGABLE_KINDS = CONTACT_KINDS.filter((k) => k !== "referred_out");

export const REFERRED_NOTE =
  "Aeon keeps only the date. It never tells the referrer that someone became your client unless that person agreed in writing (740 ILCS 110).";

export const REFERRED_OUT_NOTE =
  "Aeon keeps only the date and how many people. Never who they were or why: that stays in your clinical records.";
