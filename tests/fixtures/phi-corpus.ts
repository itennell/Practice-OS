// Labeled lines for the sensitive-info guard (lib/aeon/guard.ts). All names,
// dates and numbers are made up. Categories follow the HIPAA Safe Harbor list
// (45 CFR 164.514(b)(2)), plus diagnosis for clinical content.
//
// layer says which layer must catch a "refuse" line on its own:
//   rules  = lib/aeon/identity-filter.ts (plain code)
//   ner    = lib/aeon/phi-classifier.ts (the local name-finder); rules may miss it
// Every "pass" line must pass both layers.

export type PhiCategory = "birth_date" | "client_name" | "diagnosis" | "identifier" | "contact" | "address";
export type PhiCase =
  | { text: string; expect: "refuse"; category: PhiCategory; layer: "rules" | "ner" }
  | { text: string; expect: "pass"; note?: string };

/** Names and contacts that belong to the practice (her profile, Referrals list). */
export const ALLOWED = {
  names: ["Dana Reyes", "Reyes Counseling PLLC", "Priya Shah", "Marcus Bell"],
  contacts: ["(312) 555-0142", "dana@reyescounseling.example", "2400 N Lincoln Ave"],
};

export const PHI_CASES: PhiCase[] = [
  // ---- birth dates
  { text: "Her DOB is 3/14/1988", expect: "refuse", category: "birth_date", layer: "rules" },
  { text: "born on March 14, 1988", expect: "refuse", category: "birth_date", layer: "rules" },
  { text: "date of birth 1990-07-02", expect: "refuse", category: "birth_date", layer: "rules" },
  { text: "his birthday is 07/02/90", expect: "refuse", category: "birth_date", layer: "rules" },
  { text: "d.o.b. 12-01-1975", expect: "refuse", category: "birth_date", layer: "rules" },
  { text: "new intake, 4/22/1979, wants Tuesdays", expect: "refuse", category: "birth_date", layer: "rules" },
  { text: "b. 1/9/2001", expect: "refuse", category: "birth_date", layer: "rules" },
  { text: "Birth date: Feb 2 1966", expect: "refuse", category: "birth_date", layer: "rules" },

  // ---- client names with context (rules)
  { text: "My client Maria Lopez cancelled again", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "client Jordan wants to move to Fridays", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "patient named Kevin Ortiz called", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "my 3pm, Alicia, is late on payment", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "My 10 o'clock Sam no-showed", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "Mr. Thompson owes two copays", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "Ms. Nguyen asked for a superbill", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "Mrs. Patel needs a GFE", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "Tasha Green is my client and wants a receipt", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "Remember that Leo Park, my client, prefers mornings", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "the caller, Brianna, wants a consult", expect: "refuse", category: "client_name", layer: "rules" },
  { text: "Send a GFE to client Omar Haddad", expect: "refuse", category: "client_name", layer: "rules" },

  // ---- bare names: only the name-finder can catch these
  { text: "Maria cancelled again", expect: "refuse", category: "client_name", layer: "ner" },
  { text: "Remind me that Jordan Blake pays on the 1st", expect: "refuse", category: "client_name", layer: "ner" },
  { text: "Kevin Ortiz wants to reschedule to next week", expect: "refuse", category: "client_name", layer: "ner" },
  { text: "Can you remember Alicia Torres likes evening slots", expect: "refuse", category: "client_name", layer: "ner" },
  { text: "Draft a receipt for Samuel Okafor", expect: "refuse", category: "client_name", layer: "ner" },
  { text: "Emily Chen still hasn't paid", expect: "refuse", category: "client_name", layer: "ner" },
  { text: "Text Rachel about Thursday", expect: "refuse", category: "client_name", layer: "ner" },
  { text: "Note that Daniel Kim switched to biweekly", expect: "refuse", category: "client_name", layer: "ner" },

  // ---- diagnoses tied to a person
  { text: "My client has GAD", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "She was diagnosed with PTSD last year", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "he has bipolar disorder", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "patient with major depressive disorder wants weekly", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "Use F41.1 on the superbill", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "dx F32.1, weekly 90837", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "code it as F43.10", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "they have OCD and want a GFE", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "her schizophrenia makes Fridays hard", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "the caller's son has ADHD", expect: "refuse", category: "diagnosis", layer: "rules" },
  { text: "Diagnosed with an eating disorder, wants to start next week", expect: "refuse", category: "diagnosis", layer: "rules" },

  // ---- identifiers
  { text: "SSN 123-45-6789", expect: "refuse", category: "identifier", layer: "rules" },
  { text: "her social security number is 123 45 6789", expect: "refuse", category: "identifier", layer: "rules" },
  { text: "member ID XJH4459201", expect: "refuse", category: "identifier", layer: "rules" },
  { text: "policy number: BCB-88812-03", expect: "refuse", category: "identifier", layer: "rules" },
  { text: "subscriber # 99812734", expect: "refuse", category: "identifier", layer: "rules" },
  { text: "MRN 0045521", expect: "refuse", category: "identifier", layer: "rules" },

  // ---- contact details that aren't the practice's
  { text: "email the receipt to jlopez88@example.com", expect: "refuse", category: "contact", layer: "rules" },
  { text: "call him back at (773) 555-0198", expect: "refuse", category: "contact", layer: "rules" },
  { text: "her cell is 312.555.0177", expect: "refuse", category: "contact", layer: "rules" },
  { text: "text 847-555-0123 the consult times", expect: "refuse", category: "contact", layer: "rules" },

  // ---- client addresses
  { text: "client lives at 1820 W Belmont Ave", expect: "refuse", category: "address", layer: "rules" },
  { text: "mail her superbill to 55 Oak Street", expect: "refuse", category: "address", layer: "rules" },

  // ---- business lines that must pass
  { text: "What needs me this week?", expect: "pass" },
  { text: "Draft a Good Faith Estimate for weekly 90837 in office", expect: "pass" },
  { text: "Get me ready for CAQH", expect: "pass" },
  { text: "My license expires 6/30/2027", expect: "pass", note: "future business date" },
  { text: "I attested on CAQH on 10/20/2026", expect: "pass" },
  { text: "First visit is Nov 4, booked today", expect: "pass" },
  { text: "I don't take Medicaid", expect: "pass" },
  { text: "I prefer Tuesday afternoons for consults", expect: "pass" },
  { text: "I specialize in anxiety and depression", expect: "pass", note: "her niche" },
  { text: "I work with adults with ADHD and teens with OCD", expect: "pass", note: "her niche" },
  { text: "I treat PTSD and trauma using EMDR", expect: "pass", note: "her niche" },
  { text: "Post about how to book a first session", expect: "pass" },
  { text: "My fee for 90837 is now $175", expect: "pass" },
  { text: "My NPI is 1234567893", expect: "pass", note: "practice identifier" },
  { text: "EIN 12-3456789 for the PLLC", expect: "pass" },
  { text: "Remember Dana Reyes, LCPC on every post", expect: "pass", note: "her own name" },
  { text: "Reyes Counseling PLLC files its annual report in March", expect: "pass" },
  { text: "Dr. Priya Shah refers clients to me", expect: "pass", note: "referral source with title" },
  { text: "Marcus Bell from the clinic sends me referrals", expect: "pass", note: "on Referrals list" },
  { text: "Dr. Alan Brooks might refer to me", expect: "pass", note: "provider title" },
  { text: "Jenna Cho, LCSW, covers for me in August", expect: "pass", note: "provider credential" },
  { text: "My office is at 2400 N Lincoln Ave", expect: "pass", note: "her own address" },
  { text: "My practice phone is (312) 555-0142", expect: "pass", note: "her own phone" },
  { text: "Use dana@reyescounseling.example for the Gmail drafts", expect: "pass" },
  { text: "I hired my first employee", expect: "pass" },
  { text: "24 CE hours done", expect: "pass" },
  { text: "Quarterly taxes are due January 15", expect: "pass" },
  { text: "Is the PLLC annual report due?", expect: "pass" },
  { text: "Update my malpractice expiry to 12/31/2027", expect: "pass" },
  { text: "My client cancelled, open the 3pm slot", expect: "pass", note: "no identity" },
  { text: "A client asked for a superbill", expect: "pass" },
  { text: "Clients often ask about sliding scale fees", expect: "pass" },
  { text: "Write a post about the Client Intake Form", expect: "pass" },
  { text: "Text the caller my open consult times", expect: "pass" },
  { text: "I see clients in Lincoln Park on Mondays and Thursdays", expect: "pass" },
  { text: "Chicago requires a business license?", expect: "pass" },
  { text: "Illinois renewal is every two years", expect: "pass" },
  { text: "What does Blue Cross need for credentialing?", expect: "pass" },
  { text: "Aetna and Cigna are my next payers", expect: "pass" },
  { text: "Remind me on Friday to check Psychology Today", expect: "pass" },
  { text: "Draft an Instagram post: Meet the clinician", expect: "pass" },
  { text: "The CPT code 90791 is for intakes", expect: "pass" },
  { text: "Move the B12 shot reminder", expect: "pass", note: "not an ICD code" },
  { text: "Did I file my W2s and 1099s?", expect: "pass" },
  { text: "My practice opened in 2019", expect: "pass" },
  { text: "Telehealth on Wednesdays only", expect: "pass" },
  { text: "Send the referral letter draft to my test inbox", expect: "pass" },
  { text: "How do I get a Medicare PTAN?", expect: "pass" },
  { text: "My CAQH ID is 12345678", expect: "pass", note: "practice identifier" },
  { text: "Who called today?", expect: "pass" },
  { text: "She is my billing assistant and starts Monday", expect: "pass", note: "pronoun, no clinical word" },
  { text: "Forget the old fee", expect: "pass" },
  { text: "The insurance panel opens in January", expect: "pass" },
  { text: "I want to add couples therapy at $200", expect: "pass" },
  { text: "Group sessions run Thursday evenings", expect: "pass" },
  { text: "[Sample] Does not take Medicaid", expect: "pass", note: "demo label" },
  { text: "[Sample] Prefers Tuesday consults", expect: "pass", note: "demo label" },
  { text: "My anxiety about taxes is real, what's due?", expect: "pass", note: "her own feeling, no person ref" },
  // Streets and institutions named after people (the second read must leave them alone).
  { text: "Our office is on Martin Luther King Drive", expect: "pass", note: "street named after a person" },
  { text: "The second office is at Lake Shore Drive and Belmont", expect: "pass", note: "street" },
  { text: "Parking is on Michigan Avenue near Wacker Drive", expect: "pass", note: "streets" },
  { text: "We moved to Milwaukee Avenue in Wicker Park", expect: "pass", note: "street and neighborhood" },
  { text: "I rent a room near Logan Square", expect: "pass", note: "neighborhood named after a person" },
  { text: "Mount Sinai Hospital is on California Avenue", expect: "pass", note: "hospital and street" },
  { text: "Rush University Medical Center sends me referrals", expect: "pass", note: "institution" },
  { text: "Referrals from Northwestern Memorial Hospital are up", expect: "pass", note: "institution" },
  { text: "Lurie Children's Hospital has a waitlist", expect: "pass", note: "institution named after a person" },
  { text: "Howard Brown Health takes walk-ins", expect: "pass", note: "institution named after a person" },
  { text: "Interns come from Loyola University Chicago", expect: "pass", note: "institution" },
  { text: "My office is near Jackson Park and Hyde Park", expect: "pass", note: "parks named after people" },

  // ---- app walk-throughs (Oct 29: "Link Instagram" was read as a person)
  { text: "Look for a Connect or Link Instagram button at the top.", expect: "pass", note: "button name" },
  { text: "Open Meta Business Suite, then Account Center, and choose Switch to Professional Account.", expect: "pass", note: "Meta screens" },
  { text: "Press Connect Cal, then open Front Desk Settings.", expect: "pass", note: "app screens" },
  { text: "Go to Settings, then Connections, and press Connect Gmail.", expect: "pass", note: "app screens" },
];

/**
 * Characters glued onto the end of a client name ("Kevin Ortiz7x"). Each must
 * still be refused: letters, digits, punctuation, other scripts, invisible
 * characters (zero-width, joiners, direction marks, soft hyphen, BOM), stray
 * combining marks, odd spaces, emoji and fullwidth forms. Invisible ones are
 * escapes so they show in review. CI once let a random test tag through.
 */
export const GLUED_SUFFIXES: string[] = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  ..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
  "é", "ñ", "ß", "ø", "ł", "ğ", "Ж", "λ", "中", "あ", "한", "ع", "א",
  "\u200b", "\u200c", "\u200d", "\u2060", "\ufeff", "\u00ad", "\u200e", "\u202e",
  "\u0301", "\u0308", "\u0327", "\u00a0", "\u2009",
  "\u{1f600}", "\u{1f44d}\u{1f3fd}", "❤️", "\u{1f1fa}\u{1f1f8}", "™", "®", "°", "§", "€", "ｘ", "１",
];

/** Each suffix once, three times over, and followed by letters and digits the way a test tag is glued on. */
export const gluedNames = (name: string): string[] =>
  GLUED_SUFFIXES.flatMap((s) => [`${name}${s}`, `${name}${s}${s}${s}`, `${name}${s}t9q2`]);
