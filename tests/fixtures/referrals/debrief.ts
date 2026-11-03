// Coffee-debrief fixtures (lib/referrals/debrief.ts). Fictional people and offices only.

/** The partner talks about one of their own patients by name, age and diagnosis. */
export const PHI_TRANSCRIPT =
  "I had coffee with Dr. Okafor from Northside Women's Health this morning. " +
  "They send referrals by fax, and the front desk coordinator handles them. " +
  "They mostly see women going through cancer treatment and new parents. " +
  "Dr. Okafor told me about one of her patients, Maria Lopez, a 34-year-old who was just diagnosed with postpartum depression. " +
  "Her patient Kevin Ortiz has bipolar disorder and needs a therapist soon. " +
  "They need a therapist who can see people within two weeks. " +
  "The best time to reach the office is Tuesday mornings. " +
  "She said I should meet Jenna Cho, the oncology nurse navigator at Lakeshore Cancer Center. " +
  "I said I would send my flyer next week.";

/** Words from PHI_TRANSCRIPT that must never be stored anywhere. */
export const PATIENT_WORDS = ["Maria", "Lopez", "Kevin", "Ortiz", "34-year-old", "postpartum", "bipolar", "diagnosed"];

export const CRISIS_TRANSCRIPT =
  "Coffee with Dr. Okafor went fine. They refer by fax. Honestly I've been so overwhelmed I want to end it all.";

export const FEE_TRANSCRIPT =
  "I had coffee with Dr. Okafor. They send referrals by fax. She said other therapists pay her office a referral fee of $50 for each new client, and asked if I would too. " +
  "The best time to reach the office is Tuesday mornings.";

/** What a careless model might send back for PHI_TRANSCRIPT: patient details and invented facts mixed in. */
export const LEAKY_FIELDS = {
  refers_via: "fax",
  referral_contact: "front desk coordinator",
  populations: ["women going through cancer treatment", "new parents", "Maria Lopez, 34, postpartum depression"],
  needs_from_therapist: "A therapist who can see people within two weeks",
  waitlist: true,
  payer_mix: "About 40% Medicaid",
  best_time: "Tuesday mornings",
  last_meeting_summary: "Coffee with Dr. Okafor. Her patient Maria Lopez was diagnosed with postpartum depression. They refer by fax through the front desk coordinator.",
  connection_points: "We both love hiking in Colorado",
  who_else: [
    { name: "Jenna Cho", role: "oncology nurse navigator", organization: "Lakeshore Cancer Center" },
    { name: "Kevin Ortiz", role: "patient", organization: null },
    { name: "Sam Patel", role: "social worker", organization: "Northwestern" },
  ],
  follow_up_points: ["Send my flyer next week", "Check on Kevin Ortiz"],
};

export const FOLLOW_UP_LETTER =
  "Dear Amara Okafor, MD,\n\nThank you for meeting me for coffee. It was good to hear that your office sends referrals by fax through your front desk " +
  "coordinator, and that you need a therapist who can see people within two weeks. As I said, I will send my flyer next week.\n\nWarmly,\nDana Reyes, LCPC\nReyes Counseling PLLC";

// ---- adversarial probes (PR #129 review): default refuse ----

/** Each line is about one person, and none of it may be stored or allowlisted. */
export const PROBES = [
  "Kevin Ortiz needs a therapist soon, she said.",
  "Tom Becker, our receptionist's patient, needs help.",
  "J.R. keeps missing appointments and needs someone with evening hours.",
  "A new parent there has severe postpartum psychosis and was hospitalized.",
  "Her husband died last month and she can't stop crying.",
  "For urgent referrals, ask for the patient's mom.",
];
export const PROBE_WORDS = ["Kevin", "Ortiz", "Becker", "J.R", "JR ", "psychosis", "hospitalized", "husband", "crying", "patient's mom"];

/** Staff who must still pass: an appositive role or "our receptionist, <name>". */
export const STAFF_LINES = [
  "Linda Park, the nurse navigator, handles their referrals.",
  "Our receptionist, Rosa Diaz, answers the fax line.",
  "Brian Lee, the office manager, schedules the calls.",
  "She said I should meet Jenna Cho, the oncology nurse navigator at Lakeshore Cancer Center.",
];
export const STAFF = ["Linda Park", "Rosa Diaz", "Brian Lee", "Jenna Cho"];

export const PROBE_TRANSCRIPT = ["I had coffee with Dr. Okafor from Northside Women's Health. They send referrals by fax.", ...PROBES, ...STAFF_LINES].join(" ");

/** A model that copies every probe into the fields. */
export const PROBE_FIELDS = {
  refers_via: "fax",
  referral_contact: "the patient's mom",
  populations: ["A new parent with severe postpartum psychosis", "families in hospice"],
  needs_from_therapist: "Kevin Ortiz needs a therapist soon",
  waitlist: null,
  payer_mix: null,
  best_time: "Evening hours for J.R.",
  last_meeting_summary: "Her husband died last month and she can't stop crying. They send referrals by fax.",
  connection_points: null,
  who_else: [
    { name: "Kevin Ortiz", role: "therapist", organization: null },
    { name: "Tom Becker", role: "receptionist's patient", organization: null },
    { name: "J.R.", role: "patient", organization: null },
    { name: "Linda Park", role: "nurse navigator", organization: null },
  ],
  follow_up_points: ["Call Tom Becker about help", "Check on the new parent who was hospitalized"],
};
