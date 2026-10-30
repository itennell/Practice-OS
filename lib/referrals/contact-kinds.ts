// The kinds of contact on a Referrals card's log, for the server and the page.

export const CONTACT_KINDS = ["called", "emailed", "met", "sent_letter", "replied", "note", "referred"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_LABEL: Record<ContactKind, string> = {
  called: "Called",
  emailed: "Emailed",
  met: "Met",
  sent_letter: "Sent the letter",
  replied: "They replied",
  note: "Note",
  referred: "They referred someone",
};

export const REFERRED_NOTE =
  "Aeon keeps only the date. It never tells the referrer that someone became your client unless that person agreed in writing (740 ILCS 110).";
