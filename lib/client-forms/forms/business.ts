import { fullAddress } from "../facts";
import type { FormDef, PracticeFacts } from "../types";

// Business forms: intake (contact and business fields; anything clinical is a
// blank box for the client), emergency contact and insurance information. No law
// sets their contents; the elements come from standard practice guidance
// (docs/research.md › Client forms). They are filled in by the client, on paper
// or in their own PDF viewer, and never come back to Practice-OS.

const PRACTICE = "https://www.apaservices.org/practice/business";

const contactLine = (f: PracticeFacts) => `Questions about this form: ${f.practiceName}, ${f.phone}, ${f.email}.`;

export const intake: FormDef = {
  id: "intake",
  title: "New Client Information",
  summary: "Contact, how to reach you, and what brings you in. Clinical questions are blank boxes the client fills.",
  group: "practice",
  appliesTo: "Every new client, any license.",
  topics: ["intake", "new client", "registration", "questionnaire", "paperwork", "information"],
  elements: [
    { id: "identity", label: "Name, birth date, pronouns", citation: "Practice guidance", url: PRACTICE, level: "practice", mustSay: [/Full name/, /Date of birth/] },
    { id: "contact", label: "Address, phone, email", citation: "Practice guidance", url: PRACTICE, level: "practice", mustSay: [/Address/, /Phone/, /Email/] },
    {
      id: "contact_permission",
      label: "Permission to leave messages, by channel",
      citation: "45 CFR 164.522(b)",
      url: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.522",
      level: "law",
      mustSay: [/leave a voicemail/i, /text/i, /email/i],
    },
    { id: "clinical_blank", label: "What brings you in (a blank box, never filled by Aeon)", citation: "Practice guidance", url: PRACTICE, level: "practice", mustSay: [/What brings you in/] },
    { id: "crisis", label: "988 and 911 for emergencies", citation: "Practice-OS safety rule", url: "https://988lifeline.org/", level: "practice", mustSay: [/988/, /911/] },
  ],
  build: (f) => [
    { kind: "heading", text: "About you" },
    { kind: "field", id: "client_name", label: "Full name" },
    { kind: "field", id: "preferred_name", label: "Name you'd like us to use, and pronouns" },
    { kind: "field", id: "client_dob", label: "Date of birth" },
    { kind: "field", id: "client_address", label: "Address", lines: 2 },
    { kind: "field", id: "client_phone", label: "Phone" },
    { kind: "field", id: "client_email", label: "Email" },
    { kind: "heading", text: "How we may reach you" },
    { kind: "clause", id: "reach", text: "Tell us how we may contact you. We will only use the ways you tick." },
    { kind: "check", id: "ok_voicemail", label: "You may leave a voicemail at this number that says it is from this practice." },
    { kind: "check", id: "ok_text", label: "You may text me about appointments." },
    { kind: "check", id: "ok_email", label: "You may email me about appointments and billing." },
    { kind: "heading", text: "Getting started" },
    { kind: "field", id: "referred_by", label: "How did you hear about us?" },
    { kind: "field", id: "primary_care", label: "Primary care doctor (optional)" },
    { kind: "field", id: "presenting", label: "What brings you in? (in your own words, as much or as little as you like)", lines: 4 },
    { kind: "field", id: "goals", label: "What would you like to be different?", lines: 3 },
    { kind: "field", id: "past_care", label: "Past counseling or therapy (optional)", lines: 2 },
    { kind: "field", id: "medications", label: "Medications you take (optional)", lines: 2 },
    { kind: "clause", id: "crisis", text: "This form is not checked right away. If you are in danger or thinking about hurting yourself, call or text 988, or call 911." },
    { kind: "clause", id: "contact", text: contactLine(f), small: true },
    { kind: "signature", caption: "Signature of client (or parent or guardian)" },
  ],
};

export const emergencyContact: FormDef = {
  id: "emergency_contact",
  title: "Emergency Contact",
  summary: "Who to call in an emergency, and exactly what the practice may tell them.",
  group: "practice",
  appliesTo: "Every client, any license.",
  topics: ["emergency contact", "emergency", "contact person"],
  elements: [
    { id: "who", label: "Name, relationship, phone", citation: "Practice guidance", url: PRACTICE, level: "practice", mustSay: [/Name/, /Relationship/, /Phone/] },
    {
      id: "scope",
      label: "Only in an emergency, and only what is needed",
      citation: "740 ILCS 110/11; 45 CFR 164.510(b)",
      url: "https://www.ilga.gov/Documents/legislation/ilcs/documents/074001100K11.htm",
      level: "law",
      mustSay: [/only in an emergency/i, /only what they need to know/i],
    },
    { id: "revoke", label: "You can change or remove this person at any time", citation: "Practice guidance", url: PRACTICE, level: "practice", mustSay: [/change or remove/i] },
  ],
  build: (f) => [
    { kind: "field", id: "client_name", label: "Your name" },
    { kind: "heading", text: "Your emergency contact" },
    { kind: "field", id: "contact_name", label: "Name" },
    { kind: "field", id: "contact_relationship", label: "Relationship to you" },
    { kind: "field", id: "contact_phone", label: "Phone" },
    { kind: "field", id: "contact_phone_2", label: "Other phone (optional)" },
    { kind: "heading", text: "What we may tell them" },
    {
      kind: "clause",
      id: "scope",
      text: `${f.practiceName} will call this person only in an emergency, such as if we believe you are in danger or we cannot reach you after a health emergency. We will tell them only what they need to know to help you. Calling them does not give them access to your records.`,
    },
    { kind: "clause", id: "revoke", text: "You can change or remove this person at any time. Just tell us in writing." },
    { kind: "signature", caption: "Signature of client (or parent or guardian)" },
  ],
};

export const insuranceInfo: FormDef = {
  id: "insurance_info",
  title: "Insurance Information",
  summary: "Subscriber, member ID, group, secondary plan, assignment of benefits and who pays what.",
  group: "practice",
  appliesTo: "Clients using insurance. Skip if you are private pay only.",
  topics: ["insurance", "insurance information", "member id", "benefits", "coverage", "assignment of benefits"],
  elements: [
    { id: "plan", label: "Insurance company, member ID, group number, payer phone", citation: "CMS-1500 items 1a, 4, 11", url: "https://www.nucc.org/index.php/1500-claim-form-mainmenu-35", level: "practice", mustSay: [/Member ID/, /Group number/] },
    { id: "subscriber", label: "Subscriber name, birth date, relationship", citation: "CMS-1500 items 4, 6, 11a", url: "https://www.nucc.org/index.php/1500-claim-form-mainmenu-35", level: "practice", mustSay: [/Subscriber/, /Relationship to the subscriber/] },
    { id: "secondary", label: "Second insurance plan", citation: "CMS-1500 item 9", url: "https://www.nucc.org/index.php/1500-claim-form-mainmenu-35", level: "practice", mustSay: [/second insurance/i] },
    { id: "assignment", label: "Assignment of benefits (pay the practice directly)", citation: "CMS-1500 item 13", url: "https://www.nucc.org/index.php/1500-claim-form-mainmenu-35", level: "practice", mustSay: [/pay .* directly/i] },
    { id: "release_for_claims", label: "OK to share what the plan needs to pay the claim", citation: "CMS-1500 item 12; 45 CFR 164.506", url: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.506", level: "practice", mustSay: [/to process (the|my) claims?/i] },
    { id: "responsibility", label: "You pay what insurance doesn't (copay, deductible, denied claims)", citation: "Practice guidance", url: PRACTICE, level: "practice", mustSay: [/copay/i, /deductible/i] },
  ],
  build: (f) => [
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "field", id: "client_dob", label: "Client date of birth" },
    { kind: "heading", text: "Main insurance" },
    { kind: "field", id: "payer", label: "Insurance company" },
    { kind: "field", id: "member_id", label: "Member ID" },
    { kind: "field", id: "group_number", label: "Group number" },
    { kind: "field", id: "payer_phone", label: "Behavioral health phone on the back of the card" },
    { kind: "field", id: "subscriber_name", label: "Subscriber (the person who holds the plan)" },
    { kind: "field", id: "subscriber_dob", label: "Subscriber's date of birth" },
    { kind: "field", id: "subscriber_relationship", label: "Relationship to the subscriber (self, spouse, child, other)" },
    { kind: "field", id: "subscriber_employer", label: "Subscriber's employer (optional)" },
    { kind: "heading", text: "A second insurance plan, if you have one" },
    { kind: "field", id: "payer_2", label: "Insurance company" },
    { kind: "field", id: "member_id_2", label: "Member ID and group number" },
    { kind: "heading", text: "Your agreement" },
    {
      kind: "clause",
      id: "assignment",
      editable: true,
      label: "Insurance pays you directly",
      text: `I ask my insurance company to pay ${f.practiceName} directly for my sessions.`,
    },
    {
      kind: "clause",
      id: "release_for_claims",
      text: "The practice may share with my insurance only what it needs to process my claims. That means dates, service codes and a diagnosis code.",
    },
    {
      kind: "clause",
      id: "responsibility",
      editable: true,
      label: "What the client pays",
      text: "I pay my copay at each session. I also pay what my plan puts toward my deductible. If my plan says no to a claim, or my plan ends, I pay the full fee for those sessions. Please tell us right away if your insurance changes.",
    },
    { kind: "clause", id: "address", text: `${f.practiceName}, ${fullAddress(f)}`, small: true },
    { kind: "signature", caption: "Signature of client, subscriber, or parent or guardian" },
  ],
};
