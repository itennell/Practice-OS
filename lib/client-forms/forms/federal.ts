import { dollars, fullAddress, replyHours, signedBy } from "../facts";
import { REVIEW } from "../review";
import { fillIn, type FormDef, type PracticeFacts } from "../types";

// Forms that federal law shapes: the HIPAA Notice of Privacy Practices and its
// acknowledgment, the records (right of access) request, the nondiscrimination
// and accessibility notice (Section 1557, ADA Title III), consent to text and
// email (TCPA, 45 CFR 164.522(b)) and the card-on-file authorization (PCI DSS).
// Each element, its citation and the quote it rests on: docs/research.md ›
// Client forms. Read 2026-10-29. The 2024 reproductive-health NPP paragraphs
// 164.520(b)(1)(ii)(F)-(H) were vacated in Purl v. HHS (N.D. Tex., June 18, 2025),
// so they are left out.

const E_164_520 = "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.520";
const E_164_524 = "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.524";
const E_164_522 = "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.522";
const E_92_10 = "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-92/subpart-A/section-92.10";
const E_92_11 = "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-92/subpart-A/section-92.11";
const E_36_303 = "https://www.ecfr.gov/current/title-28/chapter-I/part-36/subpart-C/section-36.303";
const E_36_302 = "https://www.ecfr.gov/current/title-28/chapter-I/part-36/subpart-C/section-36.302";
const E_64_1200 = "https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200";
const PCI_1280 =
  "https://www.pcisecuritystandards.org/faq/articles/Frequently_Asked_Question/Can-card-verification-codes-values-be-stored-for-card-on-file-or-recurring-transactions";
const ILCS_110_4 = "https://www.ilga.gov/Documents/legislation/ilcs/documents/074001100K4.htm";
const ILCS_110_11 = "https://www.ilga.gov/Documents/legislation/ilcs/documents/074001100K11.htm";

const HEADER =
  "THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.";
const OCR = "U.S. Department of Health and Human Services, Office for Civil Rights: 200 Independence Avenue SW, Washington, D.C. 20201; 1-800-368-1019; www.hhs.gov/ocr/complaints";

const privacyContact = (f: PracticeFacts) => `${f.policies.privacy_officer.trim() || signedBy(f)}, ${f.phone}`;
const usDay = (iso: string | null) => {
  if (!iso) return fillIn("the date your privacy notice takes effect (Your policies)");
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};

const law = (id: string, label: string, citation: string, url: string, mustSay: RegExp[]) => ({ id, label, citation, url, level: "law" as const, mustSay });

export const npp: FormDef = {
  id: "npp",
  title: "Notice of Privacy Practices",
  summary: "How you use and protect client information, and every right HIPAA gives clients. Hand it out at the first session and post it.",
  group: "law",
  appliesTo: "Required for HIPAA covered entities: any practice that bills insurance or checks eligibility electronically. Good practice for everyone.",
  topics: ["notice of privacy practices", "npp", "hipaa", "privacy notice", "privacy practices"],
  note: "Give it to every client by the first session (telehealth too), post it in your office and on your website, and ask for a signed acknowledgment. If you ever contact clients to raise funds, add a paragraph saying so and how to opt out (164.520(b)(1)(iii)(A)).",
  review: [REVIEW.npp_model, REVIEW.ocr],
  elements: [
    law("header", "The exact header in capitals", "45 CFR 164.520(b)(1)(i)", E_164_520, [/THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED/]),
    law("tpo", "Treatment, payment and operations, with an example of each", "164.520(b)(1)(ii)(A)", E_164_520, [/For treatment/i, /For payment/i, /To run (our|the) practice/i, /for example/i]),
    law("other_uses", "Other uses allowed without permission", "164.520(b)(1)(ii)(B), (D)", E_164_520, [/required by law/i, /abuse or neglect/i, /serious threat/i, /court order/i, /public health/i]),
    law("stricter_law", "Stricter law is followed (Illinois mental health law, 42 CFR Part 2)", "164.520(b)(1)(ii)(C); 740 ILCS 110", ILCS_110_11, [/stricter/i, /740 ILCS 110/, /42 CFR Part 2/]),
    law("authorization", "Other uses need written permission (psychotherapy notes, marketing, sale), and permission can be taken back", "164.520(b)(1)(ii)(E)", E_164_520, [/psychotherapy notes/i, /marketing/i, /sell/i, /written permission/i, /take back/i]),
    law("right_restrict", "Right to ask for limits; must agree to self-pay limits to a health plan", "164.520(b)(1)(iv)(A); 164.522(a)(1)(vi)", E_164_520, [/limit what we (use or )?share/i, /pay .* in full/i]),
    law("right_confidential", "Right to confidential communications", "164.520(b)(1)(iv)(B)", E_164_520, [/contact you in a certain way/i]),
    law("right_access", "Right to see and get a copy", "164.520(b)(1)(iv)(C)", E_164_520, [/see or get a copy/i]),
    law("right_amend", "Right to ask for a correction", "164.520(b)(1)(iv)(D)", E_164_520, [/correct/i]),
    law("right_accounting", "Right to a list of disclosures", "164.520(b)(1)(iv)(E)", E_164_520, [/list of the times we shared/i, /six years/i]),
    law("right_paper", "Right to a paper copy of this notice", "164.520(b)(1)(iv)(F)", E_164_520, [/paper copy of this notice/i]),
    law("duties", "Duty to keep information private, give this notice and report breaches", "164.520(b)(1)(v)(A)", E_164_520, [/required by law to keep your (health )?information private/i, /breach/i]),
    law("follow_notice", "Duty to follow the notice in effect", "164.520(b)(1)(v)(B)", E_164_520, [/follow the (terms of the )?notice (that is )?(now )?in effect/i]),
    law("changes", "May change the notice, and how clients get the new one", "164.520(b)(1)(v)(C)", E_164_520, [/change this notice/i, /new (version|notice)/i]),
    law("complaints", "Complain to the practice or HHS; no retaliation", "164.520(b)(1)(vi)", E_164_520, [/complain/i, /Department of Health and Human Services/, /never (treat you worse|retaliate)/i]),
    law("contact", "Privacy contact name or title and phone", "164.520(b)(1)(vii)", E_164_520, [/Privacy contact:/]),
    law("effective", "Effective date", "164.520(b)(1)(viii)", E_164_520, [/takes effect on \d{1,2}\/\d{1,2}\/\d{4}/]),
  ],
  build: (f) => [
    { kind: "clause", id: "header", text: HEADER },
    { kind: "clause", id: "intro", text: `Your information. Your rights. Our responsibilities. This notice is from ${f.practiceName}, ${fullAddress(f)}.` },
    { kind: "heading", text: "How we use and share your information" },
    { kind: "clause", id: "tpo_treatment", text: "For treatment. We use your information to provide your care. For example, with your permission your therapist may talk with your doctor about your treatment." },
    { kind: "clause", id: "tpo_payment", text: "For payment. We use and share your information to get paid. For example, we send your insurance company the dates of your sessions and the service codes." },
    { kind: "clause", id: "tpo_operations", text: "To run our practice. We use your information to run the practice well. For example, we keep a schedule, review our records, and work with companies that help us, who must protect your information too." },
    {
      kind: "clause",
      id: "other_uses",
      text: "We may also share information without your permission when the law allows or requires it, for example: when required by law; to report suspected child, elder or disabled adult abuse or neglect; to prevent a serious threat to someone's health or safety; to answer a court order or subpoena as the law allows; for public health and health oversight; for workers' compensation; to coroners and funeral directors; and for national security.",
    },
    {
      kind: "clause",
      id: "stricter_law",
      text: "Illinois mental health law (740 ILCS 110) protects your records more strictly than HIPAA in many ways, and so does federal law for some substance use treatment records (42 CFR Part 2). When a stricter law applies, we follow the stricter law. Records from a substance use treatment program are never used against you in a legal case without your written consent or a court order.",
    },
    {
      kind: "clause",
      id: "authorization",
      text: "We need your written permission before we share psychotherapy notes, use your information for marketing, or sell it. We will not do any of these without it. Any other use not described here also needs your written permission. You can take back your permission in writing at any time; it will not undo what we already shared.",
    },
    { kind: "heading", text: "Your rights" },
    { kind: "clause", id: "right_access", text: "See or get a copy of your records. Ask us in writing. We will answer within 30 days, and we charge only a fair, cost-based fee." },
    { kind: "clause", id: "right_amend", text: "Ask us to correct your records if you think they are wrong or missing something. If we say no, we will tell you why in writing." },
    { kind: "clause", id: "right_confidential", text: "Ask us to contact you in a certain way, for example only by cell phone or at another address. We will say yes to every reasonable request, and you do not have to say why." },
    {
      kind: "clause",
      id: "right_restrict",
      text: "Ask us to limit what we use or share. We do not have to agree, except one case: if you pay for a service in full yourself and ask us not to share it with your health plan, we will say yes unless the law requires us to share it.",
    },
    { kind: "clause", id: "right_accounting", text: "Get a list of the times we shared your information in the six years before you ask, other than for treatment, payment, running our practice, and a few other cases." },
    { kind: "clause", id: "right_paper", text: "Get a paper copy of this notice at any time, even if you got it by email." },
    { kind: "clause", id: "right_complain", text: `Complain if you think we broke your privacy rights. Tell us (Privacy contact below), or file a complaint with the ${OCR}. We will never treat you worse for complaining.` },
    { kind: "heading", text: "Our responsibilities" },
    {
      kind: "clause",
      id: "duties",
      text: "We are required by law to keep your health information private, to give you this notice of our duties and privacy practices, and to tell you quickly if a breach may have exposed your information. We must follow the terms of the notice now in effect.",
    },
    { kind: "clause", id: "changes", text: "We may change this notice, and the change will apply to all the information we have about you. A new version will be in our office and on our website, and we will give you a copy if you ask." },
    { kind: "heading", text: "Questions" },
    { kind: "clause", id: "contact", text: `Privacy contact: ${privacyContact(f)}. Email: ${f.email}.` },
    { kind: "clause", id: "effective", text: `This notice takes effect on ${usDay(f.policies.npp_effective_on)}.` },
  ],
};

export const nppAck: FormDef = {
  id: "npp_ack",
  title: "Acknowledgment of Notice of Privacy Practices",
  summary: "The client signs that they got your privacy notice. If they won't, you note why.",
  group: "law",
  appliesTo: "HIPAA covered entities must make a good-faith effort to get it. Signing is never a condition of care.",
  topics: ["acknowledgment", "npp acknowledgment", "hipaa acknowledgment", "privacy notice receipt"],
  elements: [
    law("received", "Client got the notice (and which version)", "45 CFR 164.520(c)(2)(ii)", E_164_520, [/received a copy of/i, /Notice of Privacy Practices/, /effective \d{1,2}\/\d{1,2}\/\d{4}/]),
    { id: "not_a_condition", label: "Signing is not a condition of care", citation: "45 CFR 164.506(b)", url: E_164_520, level: "practice", mustSay: [/still get care/i] },
    law("good_faith", "If not signed: the effort and the reason, for the office", "164.520(c)(2)(ii)", E_164_520, [/did not sign/i, /reason/i, /We offered/i]),
  ],
  build: (f) => [
    {
      kind: "clause",
      id: "received",
      text: `I received a copy of the Notice of Privacy Practices of ${f.practiceName}, effective ${usDay(f.policies.npp_effective_on)}. Your signature only shows that you got it. You can still get care if you do not sign.`,
    },
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "signature", caption: "Signature of client, or parent, guardian or personal representative" },
    { kind: "field", id: "representative_authority", label: "If signing for the client: your relationship or authority" },
    { kind: "heading", text: "Office use only" },
    { kind: "clause", id: "good_faith", text: "If the client did not sign, write the reason and how we tried. We offered the notice on:", small: true },
    { kind: "field", id: "offered_on", label: "Date and how we offered it (in person, by email)" },
    { kind: "field", id: "reason", label: "Reason the acknowledgment was not signed", lines: 2 },
  ],
};

export const recordsRequest: FormDef = {
  id: "records_request",
  title: "Request for Your Records",
  summary: "A client asks to see or get a copy of their records, or to send them to someone. Explains timing, fees and limits.",
  group: "law",
  appliesTo: "Every practice. HIPAA (45 CFR 164.524) for covered entities; Illinois 740 ILCS 110/4 for all mental health records.",
  topics: ["records request", "request records", "right of access", "copy of records", "medical records"],
  elements: [
    law("in_writing", "Requests in writing, and the client is told", "45 CFR 164.524(b)(1)", E_164_524, [/in writing/i]),
    law("format", "Inspect, copy or both, in the form and format asked for", "164.524(c)(1)-(2)", E_164_524, [/look at/i, /copy/i, /paper/i, /electronic/i]),
    law("third_party", "Send to someone else: signed, names the person and where", "164.524(c)(3)(ii)", E_164_524, [/send (my|your) records to someone else/i, /their name and (address|where)/i]),
    law("timing", "Answer within 30 days, one 30-day extension in writing", "164.524(b)(2)", E_164_524, [/30 days/i, /in writing/i, /more time/i]),
    law("fees", "Only a reasonable, cost-based fee, told in advance", "164.524(c)(4)", E_164_524, [/cost/i, /before we (start|copy)/i]),
    law("psychotherapy_notes", "Psychotherapy notes are not included", "164.524(a)(1)(i)", E_164_524, [/psychotherapy notes/i]),
    law("denial", "A denial is in writing with the reason and review rights", "164.524(d)(2)", E_164_524, [/why in writing/i, /review/i]),
    law("illinois_age", "Illinois: who may see records (12 and older; parents of under 12; 12 to 17 if the client doesn't object)", "740 ILCS 110/4(a)", ILCS_110_4, [/12/, /parent or guardian/i, /object/i]),
  ],
  build: (f) => [
    { kind: "clause", id: "intro", text: `Use this form to ask ${f.practiceName} to let you see your records, give you a copy, or send a copy to someone else. Please make your request in writing, on this form or by email to ${f.email}.` },
    { kind: "heading", text: "About you" },
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "field", id: "client_dob", label: "Date of birth" },
    { kind: "field", id: "client_contact", label: "Phone or email to reach you" },
    { kind: "heading", text: "What you want" },
    { kind: "field", id: "which_records", label: "Which records, and from what dates", lines: 2 },
    { kind: "check", id: "want_look", label: "I want to look at my records" },
    { kind: "check", id: "want_copy", label: "I want a copy" },
    { kind: "check", id: "want_paper", label: "Paper copy" },
    { kind: "check", id: "want_electronic", label: "Electronic copy (PDF by email or secure download)" },
    { kind: "check", id: "want_summary", label: "A summary instead of the full record (we tell you any fee first)" },
    { kind: "heading", text: "Send my records to someone else (optional)" },
    { kind: "clause", id: "third_party", text: "To send your records to someone else, write their name and address, then sign below." },
    { kind: "field", id: "send_to", label: "Their name and address, or secure email", lines: 2 },
    { kind: "heading", text: "What to expect" },
    { kind: "clause", id: "timing", text: "We will answer within 30 days. If we need more time, we will tell you in writing why and when, no more than 30 days later." },
    { kind: "clause", id: "fees", editable: true, label: "Copy fees", review: REVIEW.copy_fees, text: `We charge only a fair fee based on our cost to copy and mail your records, and we will tell you the amount before we start. ${f.policies.records_fee_note}` },
    { kind: "clause", id: "psychotherapy_notes", text: "Your right to records does not include psychotherapy notes, your therapist's separate private notes from sessions. You still get your treatment record." },
    { kind: "clause", id: "denial", text: "If we say no to any part, we will tell you why in writing and how to ask for a review by another licensed professional or make a complaint. We will still give you everything else." },
    {
      kind: "clause",
      id: "illinois_age",
      text: "Under Illinois law (740 ILCS 110/4), clients 12 and older may see their own records. A parent or guardian may see records of a client under 12. For a client 12 to 17, a parent or guardian may see them if the client is told and does not object, or if the therapist does not find compelling reasons to deny it (740 ILCS 110/4(a)(3)).",
    },
    { kind: "signature", caption: "Signature of client, or parent, guardian or personal representative" },
    { kind: "field", id: "representative_authority", label: "If signing for the client: your relationship or authority" },
    { kind: "heading", text: "Office use only" },
    { kind: "field", id: "received_on", label: "Received on, ID checked by" },
    { kind: "field", id: "answered_on", label: "Answered on, and how" },
  ],
};

export const accessibilityNotice: FormDef = {
  id: "accessibility_notice",
  title: "Nondiscrimination and Accessibility Notice",
  summary: "Free language help, disability help, service animals, and how to complain. Post it and put it on your website.",
  group: "law",
  appliesTo:
    "Section 1557 notice and taglines: required if you take Medicare or Medicaid. ADA Title III duties apply to every office; this notice is good practice.",
  topics: ["nondiscrimination", "section 1557", "ada", "accessibility", "language assistance", "taglines", "disability"],
  note: "If you take Medicare or Medicaid, add HHS's translated taglines for the top 15 languages in Illinois (from hhs.gov/civil-rights) and post this in your office and on your website.",
  review: [REVIEW.taglines, REVIEW.ocr],
  elements: [
    law("nondiscrimination", "We do not discriminate (race, color, national origin, sex, age, disability)", "45 CFR 92.10(a)(1)(i)", E_92_10, [/race, color, national origin/i, /age/i, /disability/i]),
    law("disability_aids", "Free aids for people with disabilities", "92.10(a)(1)(ii); 28 CFR 36.303", E_36_303, [/sign language interpreters/i, /large print/i, /no cost|free/i]),
    law("language", "Free language help", "92.10(a)(1)(iii)", E_92_10, [/interpreters/i, /translated/i]),
    law("how_to_ask", "How to ask for help", "92.10(a)(1)(iv)", E_92_10, [/To ask for (this )?help/i]),
    law("grievance", "How to complain to us and to HHS OCR", "92.10(a)(1)(vi)-(vii)", E_92_10, [/complain/i, /Office for Civil Rights/]),
    // Not a 92.11(b) claim: the 15-language set is not printed, so this element checks only the two taglines that are.
    {
      id: "tagline",
      label: "Language-help tagline in English and Spanish (not the full 15-language set 92.11(b) asks for)",
      citation: "45 CFR 92.11(a); 92.11(b) not met",
      url: E_92_11,
      level: "practice",
      mustSay: [/ATTENTION: If you speak a language other than English, free language assistance/, /ATENCIÓN: si habla español/],
    },
    { id: "service_animals", label: "Service animals welcome, no fee", citation: "28 CFR 36.302(c)", url: E_36_302, level: "practice", mustSay: [/Service animals are welcome/i] },
    { id: "relay", label: "Relay calls (711) accepted", citation: "28 CFR 36.303(d)", url: E_36_303, level: "practice", mustSay: [/711/] },
  ],
  build: (f) => [
    {
      kind: "clause",
      id: "nondiscrimination",
      text: `${f.practiceName} follows federal civil rights laws. We do not exclude or treat anyone differently because of race, color, national origin, age, disability, or sex.`,
    },
    {
      kind: "clause",
      id: "disability_aids",
      text: "If you have a disability, we offer free help at no cost to you, such as qualified sign language interpreters, written information in large print or other formats, and captioned video sessions. You do not need to bring your own interpreter.",
    },
    { kind: "clause", id: "language", text: "If English is not your main language, we offer free help, such as qualified interpreters and information translated into your language." },
    { kind: "clause", id: "how_to_ask", text: `To ask for this help, call ${f.phone} or email ${f.email}. We accept relay calls (dial 711).` },
    { kind: "clause", id: "service_animals", text: "Service animals are welcome. There is no fee, and we will not ask for papers." },
    { kind: "clause", id: "modifications", editable: true, label: "Changing a rule for a disability", text: "If one of our rules is hard for you to follow because of a disability, tell us and we will work with you to change it." },
    {
      kind: "clause",
      id: "grievance",
      text: `If you think we did not give you this help or treated you unfairly, you can complain to us at ${f.phone} or ${f.email}. You can also file a civil rights complaint with the ${OCR}.`,
    },
    { kind: "heading", text: "Language help" },
    { kind: "clause", id: "tagline_en", text: `ATTENTION: If you speak a language other than English, free language assistance services are available to you. Call ${f.phone}.` },
    { kind: "clause", id: "tagline_es", text: `ATENCIÓN: si habla español, tiene a su disposición servicios gratuitos de asistencia lingüística. Llame al ${f.phone}.` },
  ],
};

export const communicationConsent: FormDef = {
  id: "communication_consent",
  title: "Consent to Text, Email and Voicemail",
  summary: "How the client wants to be reached, the risks of regular text and email, and how to stop texts.",
  group: "law",
  appliesTo: "Every practice that texts or emails clients (TCPA; HIPAA 164.522(b) for covered entities).",
  topics: ["texting consent", "email consent", "communication consent", "text messages", "voicemail", "sms"],
  elements: [
    law("channels", "The client picks how to be reached, without saying why", "45 CFR 164.522(b)", E_164_522, [/text/i, /email/i, /voicemail/i, /do not have to (tell us|say) why/i]),
    law("risk", "Regular email and text are not fully secure; the client accepts the risk", "45 CFR 164.530(c); HHS OCR guidance", E_164_522, [/not fully (secure|private)/i]),
    law("consent", "Consent to appointment texts and calls at this number", "47 USC 227(b); FCC 15-72", E_64_1200, [/agree .* text|We do not text clients/i]),
    law("stop", "Stop texts at any time (reply STOP)", "47 CFR 64.1200(a)(10)", E_64_1200, [/STOP/]),
    { id: "minimum", label: "Texts carry only the time, never care details", citation: "HHS OCR guidance", url: E_164_522, level: "practice", mustSay: [/never details about your care/i] },
    { id: "not_emergency", label: "Not for emergencies; 988 and 911", citation: "Practice-OS safety rule", url: "https://988lifeline.org/", level: "practice", mustSay: [/988/, /911/] },
    { id: "reply_time", label: "When to expect a reply", citation: "Practice guidance", url: "https://www.apaservices.org/practice/business", level: "practice", mustSay: [/within \d+ hours/i] },
  ],
  build: (f) => [
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "field", id: "cell", label: "Cell phone" },
    { kind: "field", id: "email", label: "Email" },
    { kind: "heading", text: "How we may contact you" },
    { kind: "clause", id: "channels", text: "Tick each way we may contact you. You do not have to tell us why, and you can change this at any time." },
    ...(f.policies.texting_ok ? [{ kind: "check" as const, id: "ok_text", label: "Text me about appointments at my cell phone." }] : []),
    { kind: "check", id: "ok_email", label: "Email me about appointments and billing." },
    { kind: "check", id: "ok_voicemail", label: "Leave a voicemail that says it is from this practice." },
    { kind: "check", id: "ok_voicemail_details", label: "The voicemail may include appointment details." },
    { kind: "heading", text: "What to know" },
    {
      kind: "clause",
      id: "risk",
      text: "Regular email and text messages are not fully secure. Someone else could see them on your phone or computer. If you tick text or email, you agree that we may use them anyway.",
    },
    {
      kind: "clause",
      id: "consent",
      text: f.policies.texting_ok === null
        ? fillIn("whether clients may text you about appointments (Your policies)")
        : f.policies.texting_ok
        ? `By ticking text, you agree that ${f.practiceName} may text or call this number about your appointments. Our texts only say the date and time, never details about your care. You can stop texts at any time by replying STOP or telling us.`
        : `We do not text clients. We call or email about appointments only, and our messages say the date and time, never details about your care. Reply STOP or tell us if you want them to end.`,
    },
    { kind: "clause", id: "reply_time", editable: true, label: "Reply time", text: `We reply to messages within ${replyHours(f)} hours on days the office is open.` },
    { kind: "clause", id: "not_emergency", text: "Do not use text or email for an emergency. If you are in danger or thinking about hurting yourself, call or text 988, or call 911." },
    { kind: "signature", caption: "Signature of client, or parent or guardian" },
  ],
};

export const cardAuthorization: FormDef = {
  id: "card_authorization",
  title: "Credit Card Authorization",
  summary: "Permission to charge a card on file for session fees and late-cancel fees. No card number and no security code on paper.",
  group: "practice",
  appliesTo: "Practices that keep a card on file. PCI DSS applies to anyone who takes cards.",
  topics: ["credit card", "card on file", "card authorization", "payment authorization", "credit card authorization"],
  note: "Have the client enter the card in your payment processor's own page. This form never holds the full card number or the security code.",
  elements: [
    { id: "no_cvv", label: "No security code (CVV) asked for or kept", citation: "PCI DSS Req. 3.3.1; PCI FAQ 1280", url: PCI_1280, level: "law", mustSay: [/never ask for or keep the .*security code/i] },
    { id: "last4", label: "Only the last 4 digits on the form", citation: "PCI DSS Req. 3.4.1", url: PCI_1280, level: "law", mustSay: [/last 4 digits/i] },
    { id: "what_charged", label: "Exactly what may be charged", citation: "Card network stored-credential rules", url: PCI_1280, level: "practice", mustSay: [/session fees/i, /late cancellation/i] },
    { id: "cancel", label: "Cancel in writing at any time", citation: "12 CFR 1005.10(c)", url: "https://www.ecfr.gov/current/title-12/chapter-X/part-1005/subpart-A/section-1005.10", level: "practice", mustSay: [/cancel this .* in writing/i] },
    { id: "copy", label: "The client gets a copy", citation: "12 CFR 1005.10(b)", url: "https://www.ecfr.gov/current/title-12/chapter-X/part-1005/subpart-A/section-1005.10", level: "law", mustSay: [/copy of this (form|authorization)/i] },
  ],
  build: (f) => [
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "field", id: "cardholder", label: "Name on the card" },
    { kind: "field", id: "card_last4", label: "Card type and last 4 digits only" },
    { kind: "field", id: "card_expires", label: "Expiration (MM/YY)" },
    { kind: "field", id: "billing_zip", label: "Billing ZIP code" },
    {
      kind: "clause",
      id: "no_cvv",
      text: "For your safety, we never ask for or keep the 3- or 4-digit security code, and we write down only the last 4 digits of your card. You enter the full card in our payment processor's secure page.",
    },
    {
      kind: "clause",
      id: "what_charged",
      editable: true,
      label: "What the card may be charged for",
      text: `I allow ${f.practiceName} to charge this card for session fees, copays and unpaid balances${
        f.policies.late_cancel_fee_cents || f.policies.no_show_fee_cents
          ? `, and for a late cancellation fee of ${dollars(f.policies.late_cancel_fee_cents)} or missed session fee of ${dollars(f.policies.no_show_fee_cents)} under the practice policies I signed`
          : ", and for late cancellation or missed session fees under the practice policies I signed"
      }. The practice will give me a receipt for every charge.`,
    },
    { kind: "clause", id: "cancel", text: "I can cancel this authorization at any time in writing. It does not cancel what I already owe." },
    { kind: "clause", id: "copy", text: "You will get a copy of this form." },
    { kind: "signature", caption: "Signature of cardholder" },
  ],
};
