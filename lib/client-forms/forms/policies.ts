import { dollars, fullAddress, signedBy } from "../facts";
import type { FormDef, PracticeFacts } from "../types";

// Practice policies, the sliding scale application and the termination letter.
// Fees and collections rules come from the ethics codes (APA 6.04, ACA A.10,
// AAMFT 8.2-8.3, NASW 1.13, 1.16-1.17), Medicare's missed-appointment rule (CMS
// MM5613) and Illinois law (735 ILCS 5/8-2001, 405 ILCS 5/3-550): docs/research.md
// › Client forms. A client's income never comes back here; the sliding scale
// form is a blank self-report.

const APA = "https://www.apa.org/ethics/code";
const ACA = "https://www.counseling.org/docs/default-source/default-document-library/ethics/2014-aca-code-of-ethics.pdf";
const AAMFT = "https://www.aamft.org/AAMFT/Legal_Ethics/Code_of_Ethics.aspx";
const NASW = "https://www.socialworkers.org/About/Ethics/Code-of-Ethics/Code-of-Ethics-English";
const MM5613 = "https://www.cms.gov/Regulations-and-Guidance/Guidance/Transmittals/downloads/R1279CP.pdf";
const ilcs = (code: string) => `https://www.ilga.gov/legislation/ilcs/documents/${code}.htm`;

const feeLine = (f: PracticeFacts) =>
  f.fees.length ? `My fees: ${f.fees.map((x) => `${x.label} ${dollars(x.cents)}`).join("; ")}.` : "My fee for each kind of session is listed on my fee schedule.";

const lateFee = (f: PracticeFacts) =>
  f.policies.late_cancel_fee_cents || f.policies.no_show_fee_cents
    ? `If you cancel with less than ${f.policies.cancel_hours} hours' notice, the fee is ${dollars(f.policies.late_cancel_fee_cents)}. If you miss a session without notice, the fee is ${dollars(f.policies.no_show_fee_cents)}.`
    : `Please cancel at least ${f.policies.cancel_hours} hours ahead so someone else can use the time.`;

export const practicePolicies: FormDef = {
  id: "practice_policies",
  title: "Practice Policies and Financial Agreement",
  summary: "Fees, cancellations, missed sessions, insurance, unpaid bills, how to reach you, records and referrals.",
  group: "ethics",
  appliesTo: "Every client. Fee terms agreed early (APA 6.04, AAMFT 8.2, 68 IAC 1283.100(m)); collections notice (APA 6.04(e), ACA A.10.d).",
  topics: ["practice policies", "cancellation policy", "no show", "financial agreement", "fee policy", "late cancel", "office policies"],
  elements: [
    { id: "fees", label: "Fees and when payment is due, agreed at the start", citation: "APA 6.04(a); 68 IAC 1283.100(m)", url: APA, level: "ethics", mustSay: [/fee/i, /due/i] },
    { id: "cancellation", label: "Cancellation and missed-session fee", citation: "AAMFT 8.2(a)", url: AAMFT, level: "ethics", mustSay: [/cancel (at least|with less than) \d+ hours/i] },
    { id: "same_for_all", label: "Missed-session fee is the same for everyone and never billed to insurance or Medicare", citation: "CMS MM5613", url: MM5613, level: "law", mustSay: [/same for every client/i, /never billed to insurance/i] },
    { id: "denied_claims", label: "What happens if insurance doesn't pay", citation: "AAMFT 8.2(c)", url: AAMFT, level: "ethics", mustSay: [/insurance (does not|doesn't) pay|not covered/i] },
    { id: "fee_changes", label: "Notice before fee changes", citation: "AAMFT 8.2", url: AAMFT, level: "ethics", mustSay: [/30 days before/i] },
    { id: "collections", label: "Written notice before collections; only minimum information shared", citation: "APA 6.04(e); ACA A.10.d; AAMFT 8.3", url: ACA, level: "ethics", mustSay: [/write to you/i, /collection/i, /never what we talked about/i] },
    { id: "ability_to_pay", label: "Tell her if the fee is hard to pay", citation: "NASW 1.13(a); ACA A.10.c", url: NASW, level: "ethics", mustSay: [/hard (for you )?to pay/i] },
    { id: "no_referral_fees", label: "No payment for referrals", citation: "NASW 1.16(c); ACA A.10.b; AAMFT 8.1; APA 6.07", url: NASW, level: "ethics", mustSay: [/never pay or accept anything/i] },
    { id: "communication", label: "How to reach her, reply time, not for emergencies", citation: "NASW-T 2.10; NASW 1.03(e)", url: NASW, level: "ethics", mustSay: [/reply/i, /988/] },
    { id: "closing", label: "If the practice closes: 30 days' notice and how to get records", citation: "735 ILCS 5/8-2001(f)", url: ilcs("073500050K8-2001"), level: "law", mustSay: [/at least 30 days/i] },
  ],
  build: (f) => [
    { kind: "heading", text: "Fees" },
    { kind: "clause", id: "fees", text: `${feeLine(f)} Payment is due at each session${f.policies.accepts_insurance ? ", including any copay or coinsurance" : ""}. We agree on your fee before your first session.` },
    { kind: "clause", id: "ability_to_pay", editable: true, text: `If my fee is hard for you to pay, tell me. ${f.policies.offers_sliding_scale ? "I keep some reduced-fee spots and can give you my sliding scale form." : "I can help you find lower-cost care."}` },
    { kind: "clause", id: "fee_changes", text: "I will tell you at least 30 days before any fee changes." },
    { kind: "heading", text: "Cancellations and missed sessions" },
    { kind: "clause", id: "cancellation", editable: true, text: lateFee(f) },
    { kind: "clause", id: "same_for_all", text: "This policy is the same for every client. A missed-session fee is never billed to insurance, including Medicare; you pay it yourself." },
    { kind: "heading", text: "Insurance and unpaid bills" },
    {
      kind: "clause",
      id: "denied_claims",
      text: f.policies.accepts_insurance
        ? "If your insurance does not pay for a session, or your coverage ends, you are responsible for the session fee. Please tell us right away if your insurance changes."
        : "I do not bill insurance. If you want to use out-of-network benefits, I give you a superbill to send yourself; if your insurance does not pay, you still owe the fee.",
    },
    {
      kind: "clause",
      id: "collections",
      text: `If a bill stays unpaid, I will write to you and give you time to pay or set up a plan before anything else happens. If it is still unpaid, I may use a collection agency or small claims court. They would get only your name, contact information and the amount owed, never what we talked about.${
        f.policies.returned_payment_fee_cents ? ` A returned payment has a ${dollars(f.policies.returned_payment_fee_cents)} fee.` : ""
      }`,
    },
    { kind: "clause", id: "no_referral_fees", text: "I never pay or accept anything in exchange for a referral, and I do not accept goods or services instead of payment." },
    { kind: "heading", text: "Reaching me" },
    {
      kind: "clause",
      id: "communication",
      editable: true,
      text: `Call ${f.phone} or email ${f.email}. I reply within ${f.policies.reply_within_hours} hours on days the office is open. Email and text are for scheduling only. I am not an emergency service: if you are in danger or thinking about hurting yourself, call or text 988, or call 911.`,
    },
    { kind: "heading", text: "Records" },
    { kind: "clause", id: "closing", text: `If I ever close my practice, I will give at least 30 days' notice and explain how to get your records. ${f.practiceName}, ${fullAddress(f)}.` },
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "signature", caption: "Signature of client, or the person responsible for payment" },
  ],
};

export const slidingScale: FormDef = {
  id: "sliding_scale",
  title: "Sliding Scale Fee Application",
  summary: "A blank self-report of household size and income range, and the fee you agree on. Nothing is saved in Practice-OS.",
  group: "practice",
  appliesTo: "Only if you offer reduced fees. Illinois has no sliding-scale rule; the ethics codes ask you to weigh ability to pay (NASW 1.13(a), ACA A.10.c).",
  topics: ["sliding scale", "reduced fee", "sliding fee", "financial hardship", "fee reduction"],
  elements: [
    { id: "criteria", label: "Same written criteria for everyone", citation: "68 IAC 1470.96(a)(14); practice guidance", url: "https://www.ilga.gov/agencies/JCAR/EntirePart?titlepart=06801470", level: "practice", mustSay: [/same (scale|table) for everyone/i] },
    { id: "self_report", label: "Household size and income range, self-reported", citation: "Practice guidance", url: NASW, level: "practice", mustSay: [/Household size/i, /income range/i] },
    { id: "review", label: "Reviewed every 12 months or when things change", citation: "Practice guidance", url: NASW, level: "practice", mustSay: [/12 months/i] },
    { id: "insurance_caution", label: "Insurance may not allow a reduced fee; real fee reported to insurers", citation: "68 IAC 1470.96(a)(12); 1375.225(c)(7)", url: "https://www.ilga.gov/agencies/JCAR/EntirePart?titlepart=06801375", level: "law", mustSay: [/insurance/i, /real fee/i] },
    { id: "gfe", label: "The Good Faith Estimate shows the reduced fee", citation: "45 CFR 149.610", url: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-G/section-149.610", level: "law", mustSay: [/Good Faith Estimate/] },
    { id: "private", label: "What you share about money stays private", citation: "NASW 1.07", url: NASW, level: "ethics", mustSay: [/stays private/i] },
  ],
  build: (f) => [
    { kind: "clause", id: "intro", text: `${f.practiceName} keeps some reduced-fee spots for people who cannot afford the full fee. ${feeLine(f)}` },
    { kind: "clause", id: "criteria", text: "Your fee is set from the household size and income range you write here. I use the same scale for everyone who asks." },
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "field", id: "household", label: "Household size (people you support)" },
    { kind: "field", id: "income_range", label: "Yearly household income range (for example $30,000 to $40,000)" },
    { kind: "field", id: "other", label: "Anything else you want me to know (optional)", lines: 2 },
    { kind: "clause", id: "self_report", text: "You do not need to send pay stubs unless I ask." },
    { kind: "field", id: "agreed_fee", label: "Fee we agree on, per session" },
    { kind: "clause", id: "review", text: "We will look at your fee again in 12 months, or sooner if your situation changes." },
    { kind: "clause", id: "insurance_caution", text: "If you use insurance, ask me first: your plan may not allow a reduced fee, and I always report my real fee and services to insurers." },
    { kind: "clause", id: "gfe", text: "If you pay yourself, your Good Faith Estimate will show your reduced fee." },
    { kind: "clause", id: "private", text: "What you share about money stays private, like everything else in your file." },
    { kind: "signature", caption: "Signature of client" },
    { kind: "signature", caption: `Signature of therapist: ${signedBy(f)}` },
  ],
};

export const terminationLetter: FormDef = {
  id: "termination_letter",
  title: "Letter Ending Therapy",
  summary: "A letter that ends therapy the right way: the reason in plain words, the last date, referrals, records and 988.",
  group: "ethics",
  appliesTo: "Any time you end therapy. Abandonment is grounds for discipline in Illinois (225 ILCS 20/19, 107/80, 55/85); APA 10.10, ACA A.11, NASW 1.17, AAMFT 1.11.",
  topics: ["termination", "termination letter", "ending therapy", "closing letter", "discharge letter"],
  note: "Write the reason in plain words, never clinical details. Ending over an unpaid bill is allowed only if the fee terms were clear from the start, the client is not in danger, and you talked about it first (NASW 1.17(c)).",
  elements: [
    { id: "reason", label: "The reason, in plain words", citation: "APA 10.10(a); ACA A.11.c; NASW 1.17(a)", url: APA, level: "ethics", mustSay: [/because/i] },
    { id: "last_date", label: "The last session date", citation: "NASW 1.17(e)", url: NASW, level: "ethics", mustSay: [/last session/i] },
    { id: "closing_session", label: "Offer of a closing session", citation: "APA 10.10(c); 68 IAC 1283.100(i)", url: APA, level: "ethics", mustSay: [/one more time|closing session/i] },
    { id: "referrals", label: "Referrals to other providers", citation: "APA 10.10(c); 68 IAC 1375.225(c)(2); 1283.100(i)", url: "https://www.ilga.gov/agencies/JCAR/EntirePart?titlepart=06801375", level: "law", mustSay: [/other (therapists|providers)/i] },
    { id: "not_abandoned", label: "Not left without care; help with the transfer", citation: "225 ILCS 107/80(a)(14); ACA A.12; NASW 1.16(b)", url: ilcs("022501070K80"), level: "law", mustSay: [/not (be )?left without care/i, /new provider/i] },
    { id: "records", label: "How to get records later", citation: "NASW 1.08; 740 ILCS 110/4", url: NASW, level: "ethics", mustSay: [/copy of your records/i] },
    { id: "return", label: "How to come back", citation: "Practice guidance", url: NASW, level: "practice", mustSay: [/come back/i] },
    { id: "crisis", label: "988 and 911", citation: "NASW-T 2.13", url: "https://988lifeline.org/", level: "practice", mustSay: [/988/, /911/] },
  ],
  build: (f) => [
    { kind: "field", id: "date", label: "Date" },
    { kind: "field", id: "client_name", label: "Dear" },
    { kind: "clause", id: "opening", text: "I am writing to tell you that our work together is ending, and to explain what happens next. I am telling you now so you have time to plan." },
    { kind: "field", id: "reason", label: "Our work is ending because (plain words, no clinical details)", lines: 3 },
    { kind: "field", id: "last_date", label: "Our last session will be on" },
    { kind: "clause", id: "closing_session", text: "I'm glad to meet one more time to talk about this ending and your next steps, if you would like." },
    { kind: "clause", id: "referrals", text: "Here are other therapists or services who may be a good fit. I'm glad to help you connect." },
    { kind: "field", id: "referral_list", label: "Referrals (names and phone numbers)", lines: 4 },
    { kind: "clause", id: "not_abandoned", text: "I want to make sure you are not left without care. With your written OK, I can send your new provider a summary to help them start." },
    { kind: "clause", id: "records", text: `You can ask for a copy of your records at any time. Contact ${f.practiceName} at ${f.phone} or ${f.email}.` },
    { kind: "clause", id: "return", editable: true, text: "If you want to come back in the future, contact me and I will let you know if I have openings." },
    { kind: "clause", id: "crisis", text: "If you are in crisis, call or text 988, or call 911 in an emergency." },
    { kind: "clause", id: "signoff", text: "With care," },
    { kind: "signature", caption: signedBy(f) },
  ],
};
