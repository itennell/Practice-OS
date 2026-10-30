import { dollars, ethicsCode, isLmft, replyHours, signedBy } from "../facts";
import { REVIEW } from "../review";
import { fillIn, type Block, type FormDef, type PracticeFacts, type RequiredElement } from "../types";

// The consent forms: informed consent to treatment (with Illinois limits of
// confidentiality), telehealth, minors and couples or family therapy. Each
// element comes from the Illinois board rules (68 IAC 1470 LCSW, 1375 LCPC,
// 1283 LMFT, 1400 psychologist), the Illinois statutes, or her profession's
// ethics code (NASW, ACA, AAMFT, APA), all read 2026-10-29: docs/research.md ›
// Client forms. Where one license's rule is stricter, every license gets it.

const IAC1375 = "https://www.ilga.gov/agencies/JCAR/EntirePart?titlepart=06801375";
const IAC1283 = "https://www.ilga.gov/agencies/JCAR/EntirePart?titlepart=06801283";
const IAC1470 = "https://www.ilga.gov/agencies/JCAR/EntirePart?titlepart=06801470";
const ilcs = (code: string) => `https://www.ilga.gov/legislation/ilcs/documents/${code}.htm`;
const NASW = "https://www.socialworkers.org/About/Ethics/Code-of-Ethics/Code-of-Ethics-English";
const ACA = "https://www.counseling.org/docs/default-source/default-document-library/ethics/2014-aca-code-of-ethics.pdf";
const APA = "https://www.apa.org/ethics/code";
const AAMFT = "https://www.aamft.org/AAMFT/Legal_Ethics/Code_of_Ethics.aspx";

const el = (id: string, label: string, citation: string, url: string, level: RequiredElement["level"], mustSay: RegExp[]): RequiredElement => ({
  id,
  label,
  citation,
  url,
  level,
  mustSay,
});

const backup = (f: PracticeFacts) => f.policies.backup_colleague.trim() || fillIn("the colleague who will contact clients if you can't (Your policies)");
const fees = (f: PracticeFacts) =>
  f.fees.length ? f.fees.map((x) => `${x.label}: ${dollars(x.cents)}`).join("; ") : fillIn("your fees (Admin › Office hours and fees)");
const insuranceLine = (f: PracticeFacts) =>
  f.policies.accepts_insurance === null
    ? fillIn("whether you bill insurance (Your policies)")
    : f.policies.accepts_insurance
      ? "If you use insurance, your plan may limit how many sessions it pays for or what it covers, and you pay what it does not."
      : "I do not bill insurance; I can give you a superbill to send to your plan yourself.";

/** Printed for LMFTs only: 405 ILCS 5/3-550(c) does not name their license, so they ask a parent first. */
const lmftCaveat = (f: PracticeFacts): Block[] =>
  isLmft(f)
    ? [
        {
          kind: "clause",
          id: "lmft_caveat",
          text: "Please note: I am a licensed marriage and family therapist. The law that lets clients 12 and older start therapy on their own lists counselors, social workers and psychologists, and does not name my license (405 ILCS 5/3-550(c)). So I ask a parent or guardian to agree before I see any client under 18.",
          review: "You are an LMFT: 405 ILCS 5/3-550(c) does not name your license. Ask your attorney whether you may use the 12-and-older path at all.",
        },
      ]
    : [];

const FOID_REVIEW =
  "Whether the FOID clear-and-present-danger report (430 ILCS 65/8.1) binds your license, and whether Illinois gives you a duty to warn (740 ILCS 110/11 says \"may\"), is unsettled for LCSW, LCPC and LMFT. Ask your attorney before relying on these two limits.";

const LIMITS = [
  "If I believe a child is being abused or neglected, Illinois law requires me to report it to DCFS right away (325 ILCS 5/4).",
  "If I believe an adult 60 or older, or an adult with a disability, is being abused, neglected or exploited, I must report it within 24 hours (320 ILCS 20/4).",
  "If you or someone else is in clear and immediate danger of serious harm, or you make a serious threat to hurt a person who can be identified, I may share what is needed to keep people safe, including warning that person or the police (740 ILCS 110/11).",
  "If I find that someone is a clear and present danger to themselves or others, Illinois law may require me to report it to the state within 24 hours, which can affect a firearm card (FOID) (430 ILCS 65/8.1).",
  "In a medical emergency when you can't speak for yourself, I may share what emergency staff need to treat you.",
  "A subpoena alone is not enough to get your records. A judge's order or your written OK is needed (740 ILCS 110/10).",
  "If you file a complaint or lawsuit against me, I may use your records to respond.",
  "I may talk about your care with other professionals for advice, sharing as little as possible. They must keep it private too.",
  "In all other cases, I share your information only with your written permission.",
];

export const informedConsent: FormDef = {
  id: "informed_consent",
  title: "Informed Consent for Therapy",
  summary: "What therapy with you involves, fees, risks, your training, limits of confidentiality under Illinois law, and the client's rights.",
  group: "ethics",
  appliesTo: "Every client, every license. Required by the Illinois board rules (68 IAC 1375.225, 1283.100) and every ethics code (NASW 1.03, ACA A.2, AAMFT 1.2, APA 10.01).",
  review: [REVIEW.aamft, REVIEW.aca, REVIEW.collections],
  topics: ["informed consent", "consent for treatment", "consent to treatment", "consent form", "limits of confidentiality"],
  elements: [
    el("purpose_methods", "Purpose, methods and how therapy usually goes", "NASW 1.03(a); APA 10.01(a); 68 IAC 1375.225(a)(9)", IAC1375, "ethics", [/what (our work|therapy) (together )?is for/i, /how sessions (usually )?go/i]),
    el("risks_benefits", "Risks and benefits", "NASW 1.03(a); ACA A.2.b", ACA, "ethics", [/can help/i, /uncomfortable/i]),
    el("alternatives", "Other kinds of help", "NASW 1.03(a)", NASW, "ethics", [/other kinds of help/i]),
    el("qualifications", "Her license, training and ethics code", "ACA A.2.b; 68 IAC 1375.225(a)(9)", IAC1375, "law", [/licensed/i, /code of ethics/i]),
    el("fees_billing", "Fees, billing, insurance limits and unpaid bills", "NASW 1.03(a); APA 10.01(a); 68 IAC 1283.100(m)", IAC1283, "law", [/fee/i, /insurance/i, /unpaid/i]),
    el("fee_amounts", "Her actual fee for each kind of session", "APA 6.04(a); 68 IAC 1283.100(m)", IAC1283, "law", [/: \$\d/]),
    el("length", "About how long therapy may last", "68 IAC 1375.225(a)(9); 1283.100(m)", IAC1375, "law", [/how long/i]),
    el("refuse_stop", "Right to refuse or stop at any time", "NASW 1.03(a); ACA A.2.b", NASW, "ethics", [/stop at any time/i, /say no/i]),
    el("questions", "Right to ask questions at any time", "NASW 1.03(a); APA 10.01(a)", APA, "ethics", [/ask questions/i]),
    el("confidentiality", "Privacy is protected by Illinois law (740 ILCS 110)", "740 ILCS 110/3; 68 IAC 1375.225(b)(1)", ilcs("074001100K3"), "law", [/740 ILCS 110/, /private/i]),
    el("limit_child_abuse", "Limit: child abuse reporting", "325 ILCS 5/4", ilcs("032500050K4"), "law", [/child is being abused/i, /DCFS/]),
    el("limit_adult_abuse", "Limit: elder and disabled adult abuse reporting", "320 ILCS 20/4", ilcs("032000200K4"), "law", [/60 or older/i, /24 hours/i]),
    el("limit_danger", "Limit: danger to self or others, duty to warn", "740 ILCS 110/11; NASW 1.07(c)", ilcs("074001100K11"), "law", [/serious harm/i, /warning that person/i]),
    el("limit_foid", "Limit: clear and present danger report (FOID)", "430 ILCS 65/8.1", ilcs("043000650K8.1"), "law", [/FOID/]),
    el("limit_court", "Limit: court orders (a subpoena alone is not enough)", "740 ILCS 110/10", ilcs("074001100K10"), "law", [/subpoena alone is not enough/i]),
    el("technology", "Technology, email and text risks", "68 IAC 1375.225(c)(4)-(5); NASW 1.03(e)", IAC1375, "law", [/not fully private/i]),
    el("records", "Records kept, how long, and access", "68 IAC 1375.225(c)(4); NASW 1.08", IAC1375, "law", [/7 years/i, /copy/i]),
    el("continuity", "Plan if she becomes ill or dies", "68 IAC 1375.225(a)(9); ACA A.2.b; APA 3.12", IAC1375, "law", [/seriously ill or die/i]),
    el("recording", "No recording without written permission", "NASW 1.03(h); APA 4.03", NASW, "ethics", [/record/i, /written permission/i]),
    el("online_search", "No looking clients up online without permission", "NASW 1.03(i)", NASW, "ethics", [/look you up online/i]),
    el("conflicts", "She tells the client about any conflict of interest", "68 IAC 1470.96(a)(13); 1283.100(i)", IAC1470, "law", [/relationship or interest/i]),
    el("emergencies", "Not an emergency service: 988 and 911", "NASW-T 2.13", "https://988lifeline.org/", "practice", [/988/, /911/]),
    el("signed_copy", "Signed by both, client gets a copy", "APA 3.10(d); ACA A.2.a; 68 IAC 1375.225(a)(9)", IAC1375, "ethics", [/copy of this form/i]),
  ],
  build: (f) => [
    { kind: "clause", id: "intro", text: `Welcome to ${f.practiceName}. Before we start, I want you to know what therapy with me involves, so you can decide if it is right for you. Please read this, ask me anything, and sign when you are ready.` },
    { kind: "heading", text: "About me" },
    { kind: "practice", label: "Therapist", value: signedBy(f) },
    { kind: "practice", label: "License", value: `${f.licenseType}, licensed in Illinois by the ${f.board}` },
    { kind: "clause", id: "qualifications", text: `I am licensed to practice in Illinois, and I follow Illinois law and ${ethicsCode(f)}. You can ask me about my training and experience at any time.` },
    { kind: "clause", id: "approach", editable: true, label: "Your approach", text: "In my work I draw on approaches that research supports. If I ever suggest a newer method, I will tell you and explain the risks first." },
    { kind: "heading", text: "What therapy involves" },
    { kind: "clause", id: "purpose_methods", text: "At the start, we will talk about what our work together is for and what you hope will change. I will explain how sessions usually go and about how long this kind of work may take." },
    { kind: "clause", id: "risks_benefits", text: "Therapy can help, but talking about hard things can feel uncomfortable at times. There is no promise of a certain result. You can ask me about other kinds of help, and I will tell you about them." },
    { kind: "clause", id: "refuse_stop", text: "You can say no to any part of therapy, or stop at any time. I will explain what stopping could mean, and help you find other care if you want it." },
    { kind: "clause", id: "questions", text: "You can ask questions now or at any time. If anything here is unclear, I will explain it another way. If you would like an interpreter, I will help arrange one." },
    { kind: "clause", id: "conflicts", text: "If I have any relationship or interest that could affect your care, I will tell you." },
    { kind: "heading", text: "Fees and billing" },
    { kind: "clause", id: "fees_billing", text: `${fees(f)}. Payment is due at each session. ${insuranceLine(f)} If a bill stays unpaid, I will write to you first and give you time to pay or set up a plan. My practice policies give the details.` },
    { kind: "clause", id: "length", text: "We will talk about how long therapy may last, and we will check in on it along the way." },
    { kind: "heading", text: "Your privacy and its limits" },
    { kind: "clause", id: "confidentiality", text: "What you say in therapy stays private. Illinois law (740 ILCS 110) protects your records and what you tell me, more strictly than many states. There are a few exceptions, listed here." },
    { kind: "clause", id: "limit_child_abuse", text: LIMITS[0] },
    { kind: "clause", id: "limit_adult_abuse", text: LIMITS[1] },
    { kind: "clause", id: "limit_danger", text: LIMITS[2], review: FOID_REVIEW },
    { kind: "clause", id: "limit_foid", text: LIMITS[3], review: FOID_REVIEW },
    { kind: "clause", id: "limit_emergency", text: LIMITS[4] },
    { kind: "clause", id: "limit_court", text: LIMITS[5] },
    { kind: "clause", id: "limit_complaint", text: LIMITS[6] },
    { kind: "clause", id: "limit_consult", text: LIMITS[7] },
    { kind: "clause", id: "limit_other", text: LIMITS[8] },
    { kind: "heading", text: "Technology, records and recordings" },
    { kind: "clause", id: "technology", text: "I use phone, email, video and online billing tools. They make things easier, but email and text are not fully private, so please use them for scheduling only." },
    { kind: "clause", id: "records", text: "I keep a record of our work in a secure system. I keep records for at least 7 years after our last session, and for a client under 18, until 7 years after they turn 18. You can ask to see or get a copy." },
    { kind: "clause", id: "recording", text: "I will never record a session, or let anyone watch one, without your written permission. Please do not record sessions without mine." },
    { kind: "clause", id: "online_search", text: "I will not look you up online without your permission, except in an emergency." },
    { kind: "clause", id: "continuity", text: `If I become seriously ill or die, ${backup(f)} will contact you, keep your records safe, and help you find a new therapist.` },
    { kind: "heading", text: "Emergencies" },
    { kind: "clause", id: "emergencies", text: "I am not an emergency service and may not see messages right away. If you are in danger or thinking about hurting yourself, call or text 988, or call 911." },
    { kind: "heading", text: "Your consent" },
    { kind: "clause", id: "signed_copy", text: "By signing, you say you have read this form, had the chance to ask questions, and agree to therapy. This consent lasts until we stop working together or you take it back in writing. You will get a copy of this form." },
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "signature", caption: "Signature of client (or parent or guardian of a client under 12)" },
    { kind: "signature", caption: `Signature of therapist: ${signedBy(f)}` },
  ],
};

export const telehealthConsent: FormDef = {
  id: "telehealth_consent",
  title: "Consent for Telehealth",
  summary: "Video and phone sessions: Illinois location rule, privacy, what happens if the call drops, and emergencies.",
  group: "ethics",
  appliesTo: "Every client you see by video or phone. Illinois has no required telehealth form; the ethics codes (ACA H.2.a, AAMFT 6, NASW 1.03(f)) require these disclosures.",
  review: [REVIEW.aamft, REVIEW.aca],
  topics: ["telehealth", "telehealth consent", "video sessions", "teletherapy", "online therapy", "phone sessions"],
  elements: [
    el("choice", "Telehealth is the client's choice; in person is available", "ACA H.2.a", ACA, "ethics", [/your choice/i, /in person/i]),
    el("location", "The client must be in Illinois (or where she is licensed); location checked each session", "225 ILCS 150/10; AAMFT 6.5; NASW 1.03(f)", ilcs("022501500K10"), "law", [/in Illinois/i, /where you are/i]),
    el("same_standard", "Same standard of care as in person", "225 ILCS 150/15(a)", ilcs("022501500K15"), "law", [/same professional standards/i]),
    el("privacy", "Secure platform; private place; no technology is fully private", "225 ILCS 150/15(b); AAMFT 6.3; ACA H.2.b", ilcs("022501500K15"), "law", [/secure/i, /private place/i, /fully private/i]),
    el("failure", "If the connection drops: the backup plan", "ACA H.2.a; NASW-T 2.12", ACA, "ethics", [/call drops|connection drops/i, /call you/i]),
    el("emergency", "Emergency plan, 988 and 911, the client's location and a contact", "ACA H.2.a; NASW-T 2.13", ACA, "ethics", [/988/, /911/, /address/i]),
    el("insurance", "Insurance may not pay for telehealth", "ACA H.2.a; 215 ILCS 5/356z.22", ilcs("021500050K356z.22"), "ethics", [/insurance/i]),
    el("response_time", "When she replies to messages", "ACA H.2.a", ACA, "ethics", [/reply to messages within \d+ hours/i]),
    el("social_media", "No social media contact", "ACA H.2.a; NASW-T 2.10", ACA, "ethics", [/social media/i]),
    el("recording", "No recording without written permission", "APA 4.03", APA, "ethics", [/record/i]),
  ],
  build: (f) => [
    { kind: "clause", id: "choice", text: `${f.practiceName} offers sessions by video and by phone. Telehealth is your choice. You can ask to meet in person instead, and if video is not working well for you, we will change the plan.` },
    { kind: "clause", id: "same_standard", text: "Telehealth sessions follow the same professional standards as office visits (225 ILCS 150/15)." },
    { kind: "heading", text: "Where you are" },
    { kind: "clause", id: "location", text: "I am licensed in Illinois, so I can meet with you only while you are in Illinois. At the start of each session I will confirm who you are and where you are. If you travel or move, tell me first." },
    { kind: "field", id: "usual_address", label: "Address where you usually join sessions", lines: 2 },
    { kind: "field", id: "emergency_contact", label: "Emergency contact name and phone" },
    { kind: "heading", text: "Privacy" },
    { kind: "clause", id: "privacy", text: "I use a secure, HIPAA-compliant video service. Please join from a private place, on your own device, and avoid public Wi-Fi. No technology is fully private, and others could see messages if a device is shared or hacked." },
    { kind: "clause", id: "recording", text: "Neither of us will record a session without the other's written permission." },
    { kind: "heading", text: "If something goes wrong" },
    { kind: "clause", id: "failure", text: "If the call drops, I will call you at the number below. If we cannot reconnect, we will finish by phone or reschedule." },
    { kind: "field", id: "backup_phone", label: "Phone number to call if the video drops" },
    { kind: "clause", id: "emergency", text: "If there is an emergency during a session, I may call 911 to the address you gave me. Between sessions, if you are in danger or thinking about hurting yourself, call or text 988, or call 911." },
    { kind: "heading", text: "Other things to know" },
    { kind: "clause", id: "insurance", text: "Check with your insurance that it pays for video or phone sessions. If it does not, you pay the full fee." },
    { kind: "clause", id: "response_time", editable: true, label: "Reply time and time zone", text: `I usually reply to messages within ${replyHours(f)} hours on business days. Session times are in Central Time.` },
    { kind: "clause", id: "social_media", text: "I do not connect with clients on social media, and I do not reply to messages sent there." },
    { kind: "clause", id: "minor", text: "If you are under 12, a parent or guardian signs for you." },
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "signature", caption: "Signature of client (or parent or guardian)" },
  ],
};

export const minorConsent: FormDef = {
  id: "minor_consent",
  title: "Consent for Therapy with a Minor",
  summary: "Illinois rules for clients under 18: who consents, the 8-session rule for ages 12 to 16, parent access to records, separated parents.",
  group: "law",
  appliesTo: "Every client under 18. Illinois 405 ILCS 5/3-550 and 740 ILCS 110/4; ACA A.2.d, APA 3.10(b).",
  topics: ["minor consent", "minor", "child", "teen", "adolescent", "parent consent", "guardian consent"],
  review: [
    "405 ILCS 5/3-550(c) names counselors, social workers and psychologists, not LMFTs. Whether an LMFT may see a 12 to 16 year old without a parent's consent is unsettled; the form tells LMFT clients you ask a parent first.",
    "For teens 12 to 17, 750 ILCS 5/602.11(b) gives both parents record access, while 740 ILCS 110/4(a)(3) and 405 ILCS 5/3-550(a-2) protect the teen. Which controls for mental health records is unsettled.",
    "740 ILCS 110/4(a)(3) is worded \"or\": read literally, either the teen not objecting or your not finding compelling reasons is enough for a parent to see the record. Some read it the other way. The form follows the statute's words.",
  ],
  elements: [
    el("under_12", "Under 12: a parent or guardian consents and can see records", "740 ILCS 110/4(a)(1)", ilcs("074001100K4"), "law", [/under 12/i, /parent or (legal )?guardian/i]),
    el("twelve_plus", "12 and older can start therapy on their own", "405 ILCS 5/3-550(a)", ilcs("040500050K3-550"), "law", [/12 or older/i, /without a parent/i]),
    el("eight_sessions", "Under 17: up to 8 sessions of 90 minutes before a parent consents", "405 ILCS 5/3-550(a)", ilcs("040500050K3-550"), "law", [/8 sessions/i, /90 minutes/i]),
    el("decide_by_8th", "By the 8th session, she decides with the minor whether asking a parent would harm the minor, and tells them", "405 ILCS 5/3-550(a)", ilcs("040500050K3-550"), "law", [/no later than the 8th session/i, /tell you my decision/i]),
    el("after_eighth", "After session 8: a parent's consent is needed to go on; if the minor won't allow a parent to be contacted, therapy stops and the parent is not told", "405 ILCS 5/3-550(a)(1)-(2)", ilcs("040500050K3-550"), "law", [/consent is needed to keep going/i, /must stop after the 8th session/i, /will not tell your parent or guardian about your therapy/i]),
    el("two_attempts", "If the minor allows contact: 2 tries to reach a parent, each written in the record, then the minor's written consent", "405 ILCS 5/3-550(a)(3)", ilcs("040500050K3-550"), "law", [/at least 2 times/i, /write down each try/i, /your written consent/i]),
    el("four_factors", "All four factors must be true to find asking a parent would harm the minor", "405 ILCS 5/3-550(a-1)", ilcs("040500050K3-550"), "law", [/all four/i, /make you refuse therapy/i, /not getting therapy would harm/i, /knowingly and by your own choice/i, /mature enough/i]),
    el("detrimental_path", "If so: written reasons, a supervisor when possible, the minor's written consent, reviewed every 60 days until 17", "405 ILCS 5/3-550(a)(4)-(5)", ilcs("040500050K3-550"), "law", [/supervisor/i, /every 60 days/i, /turn 17/i]),
    el("abuse_presumption", "If therapy is about abuse or neglect by a parent, asking that parent is presumed harmful", "405 ILCS 5/3-550(a)(6)", ilcs("040500050K3-550"), "law", [/presumed to harm you/i]),
    el("parent_not_told", "The parent is not told without the minor's written OK, except as the law requires", "405 ILCS 5/3-550(a-2)", ilcs("040500050K3-550"), "law", [/won't be told|will not be told|not tell your parent/i, /choose to stop/i]),
    el("parent_not_liable", "A parent who did not consent does not pay", "405 ILCS 5/3-550(b)", ilcs("040500050K3-550"), "law", [/does not have to pay/i]),
    el("records_12_17", "Parent access to records of a 12 to 17 year old (either condition is enough)", "740 ILCS 110/4(a)(3)", ilcs("074001100K4"), "law", [/12 to 17/i, /(do|does)(n.t| not) object, or if/i, /compelling reasons/i]),
    el("separated_parents", "Separated or divorced parents: both may see records; bring the parenting plan", "750 ILCS 5/602.11", ilcs("075000050K602.11"), "law", [/separated or divorced/i, /parenting plan|allocation/i]),
    el("substance_use", "12 and older may consent to alcohol or drug counseling", "410 ILCS 210/4", ilcs("041002100K4"), "law", [/alcohol or drugs/i]),
    el("emancipated", "Emancipated minors bring the court order", "750 ILCS 30/5", ilcs("075000300K5"), "law", [/emancipat/i]),
    el("limits", "Safety and abuse limits still apply", "325 ILCS 5/4; 740 ILCS 110/11", ilcs("032500050K4"), "law", [/abuse/i, /988/]),
  ],
  build: (f) => [
    { kind: "clause", id: "intro", text: `This form explains how ${f.practiceName} works with clients under 18 under Illinois law. A parent or guardian and the young person should read it together when they can.` },
    { kind: "heading", text: "Who can agree to therapy" },
    { kind: "clause", id: "under_12", text: "For a child under 12, a parent or legal guardian signs this form and can see the child's records." },
    { kind: "clause", id: "twelve_plus", text: "If you are 12 or older, you can start therapy without a parent's permission (405 ILCS 5/3-550)." },
    ...lmftCaveat(f),
    { kind: "heading", text: "If you are 12 to 16 and came on your own" },
    {
      kind: "clause",
      id: "eight_sessions",
      text: "Until a parent or guardian agrees, we can meet for up to 8 sessions at first, each up to 90 minutes long (405 ILCS 5/3-550(a)).",
    },
    {
      kind: "clause",
      id: "decide_by_8th",
      text: "As we go, we will talk about whether asking a parent or guardian to agree would harm you. No later than the 8th session, I will decide and tell you my decision.",
    },
    {
      kind: "clause",
      id: "after_eighth",
      text: "If I decide that asking would not harm you, I will tell you that a parent's or guardian's consent is needed to keep going. If you do not let me contact your parent or guardian for consent, our sessions must stop after the 8th session, and I will not tell your parent or guardian about your therapy (405 ILCS 5/3-550(a)(2)).",
    },
    {
      kind: "clause",
      id: "two_attempts",
      text: "If you let me contact them, we can keep meeting while I try to get their consent. I will write down each try in your record. If I try at least 2 times and can't reach them, we can go on with your written consent (405 ILCS 5/3-550(a)(3)).",
    },
    {
      kind: "clause",
      id: "four_factors",
      text: "I can decide that asking a parent or guardian would harm you only if all four of these are true (405 ILCS 5/3-550(a-1)): (1) needing a parent's consent, or a parent being told, would make you refuse therapy; (2) not getting therapy would harm your well-being; (3) you came to therapy knowingly and by your own choice; and (4) in my opinion, you are mature enough to take part in therapy in a useful way.",
    },
    {
      kind: "clause",
      id: "detrimental_path",
      text: "If I decide that, I will write down why in your record and check with a supervisor when I can. Then I may keep seeing you with only your written consent. I will review that decision every 60 days until therapy ends or you turn 17 (405 ILCS 5/3-550(a)(4)-(5)).",
    },
    {
      kind: "clause",
      id: "abuse_presumption",
      text: "If therapy is about neglect or abuse by a parent or guardian, asking that parent or guardian to agree is presumed to harm you (405 ILCS 5/3-550(a)(6)).",
    },
    { kind: "heading", text: "Your parents and what they are told" },
    {
      kind: "clause",
      id: "parent_not_told",
      text: "Your parent won't be told you are in therapy unless you agree in writing, except where the law above requires it. If I ever decide I must tell a parent, I will tell you first. If you then choose to stop therapy, your parent will not be told (405 ILCS 5/3-550(a-2)).",
    },
    { kind: "clause", id: "parent_not_liable", text: "A parent who did not agree to your therapy does not have to pay for it. We will work out a fee you can manage, or no fee." },
    { kind: "clause", id: "substance_use", text: "If you are 12 or older, you can agree on your own to counseling about alcohol or drugs." },
    { kind: "clause", id: "emancipated", text: "If a court has emancipated you, please bring a copy of the order so I know what you can sign." },
    { kind: "heading", text: "Records" },
    {
      kind: "clause",
      id: "records_12_17",
      text: "If you are 12 to 17, a parent or guardian may see your record if you are told and do not object, or if I do not find compelling reasons to deny it (740 ILCS 110/4(a)(3)). Even so, I will not let a parent see the record of therapy you started on your own if I find compelling reasons to deny it (405 ILCS 5/3-550(a-2)). The same law lets a parent get basic facts (your condition, diagnosis and the services you get), and a parent who is refused can ask a court.",
    },
    {
      kind: "clause",
      id: "separated_parents",
      text: "If parents are separated or divorced, both usually have the right to see a child's health records unless a court order says otherwise. Please give me a copy of the parenting plan (allocation judgment) or any order of protection.",
    },
    { kind: "heading", text: "Safety" },
    { kind: "clause", id: "limits", text: "Even for minors, I must report suspected abuse or neglect, and I may share what is needed if someone is in serious danger. If you are in danger or thinking about hurting yourself, call or text 988, or call 911." },
    { kind: "field", id: "client_name", label: "Client name" },
    { kind: "field", id: "client_dob", label: "Client date of birth" },
    { kind: "field", id: "parent_name", label: "Parent or guardian name, and relationship" },
    { kind: "check", id: "court_order", label: "There is a parenting plan, custody order or order of protection (a copy is attached)." },
    { kind: "signature", caption: "Signature of client (age 12 or older)" },
    { kind: "signature", caption: "Signature of parent or guardian" },
  ],
};

export const couplesFamilyConsent: FormDef = {
  id: "couples_family_consent",
  title: "Consent for Couples and Family Therapy",
  summary: "Who the client is, how private things are handled between you, records, and what happens if you separate.",
  group: "ethics",
  appliesTo: "Couples and family clients, every license. LMFTs: 68 IAC 1283.100(p) makes the all-adults release required.",
  review: [REVIEW.aamft, "The no-secrets policy is fixed wording: AAMFT 2.2 needs each partner's prior written permission. Have your attorney check the waiver."],
  topics: ["couples", "couples consent", "family therapy", "family consent", "marriage counseling", "no secrets"],
  elements: [
    el("who_is_client", "Who the client is (the couple or family)", "APA 10.02(a); ACA B.4.b", APA, "ethics", [/my client is the (couple|relationship)/i]),
    el("secrets", "How private things told alone are handled (no-secrets policy)", "NASW 1.07(g); AAMFT 2.2", AAMFT, "ethics", [/no-secrets policy/i, /(one of you tells me|tell me) something (privately|alone)/i]),
    el("secrets_waiver", "Each partner's written waiver for the no-secrets policy", "AAMFT 2.2", AAMFT, "ethics", [/each adult's written permission/i, /I agree to the no-secrets policy/i]),
    el("no_guarantee", "She can't promise others in the room keep things private", "NASW 1.07(f)", NASW, "ethics", [/cannot promise/i]),
    el("all_sign", "Every adult signs before records or information are released", "68 IAC 1283.100(p)(4); AAMFT 2.2-2.3", IAC1283, "law", [/every adult/i, /sign/i]),
    el("divorce", "If you separate: no sides, no custody evaluation, records not opened by divorce alone", "APA 10.02(b); AAMFT 7.6-7.7; 740 ILCS 110/10(a)(1)", ilcs("074001100K10"), "law", [/separate or divorce/i, /custody/i]),
    el("decisions", "Decisions about the relationship are yours", "AAMFT 1.8", AAMFT, "ethics", [/decisions about/i, /yours/i]),
    el("individual_sessions", "Individual sessions are part of the joint work", "AAMFT (practice guidance)", AAMFT, "practice", [/meet with one of you alone/i]),
  ],
  build: (f) => [
    { kind: "clause", id: "intro", text: `This form adds to the informed consent for therapy at ${f.practiceName}. Each adult in therapy reads and signs it.` },
    { kind: "clause", id: "who_is_client", text: "In couples or family work, my client is the couple or family as a whole, unless we agree in writing on something else. I will treat each of you fairly." },
    { kind: "clause", id: "individual_sessions", text: "If I meet with one of you alone, that meeting is part of our joint work." },
    // Locked: AAMFT 2.2 bars sharing one person's confidences without that person's prior written
    // permission, so a no-secrets policy needs each partner's written waiver (research open question 6).
    { kind: "heading", text: "No-secrets policy" },
    {
      kind: "clause",
      id: "secrets",
      text: "I follow a no-secrets policy. If one of you tells me something privately, alone or in a message, that affects our work together, I will not keep it secret from the others in therapy. I will first help you share it yourself in a joint session. If you don't, I may share it.",
    },
    {
      kind: "clause",
      id: "secrets_waiver",
      text: "This policy needs each adult's written permission. By ticking the box and signing below, each of you gives me your written permission to share with the others in therapy what you tell me alone. If any adult does not give this permission, I will keep what each of you tells me alone private, and I will tell you all if that makes our joint work hard to go on with.",
    },
    { kind: "check", id: "waiver_1", label: "Adult 1: I agree to the no-secrets policy and give my written permission above." },
    { kind: "check", id: "waiver_2", label: "Adult 2: I agree to the no-secrets policy and give my written permission above." },
    { kind: "check", id: "waiver_3", label: "Adult 3 (if more): I agree to the no-secrets policy and give my written permission above." },
    { kind: "clause", id: "no_guarantee", text: "I keep what is said private, but I cannot promise that others in the room will." },
    { kind: "clause", id: "all_sign", text: "Because the record belongs to all of you, every adult in therapy must sign before I release records or share information outside therapy, unless the law requires it." },
    {
      kind: "clause",
      id: "divorce",
      text: "If you separate or divorce, I will not take sides, act as a witness for one of you, or do a custody evaluation. Filing for divorce does not by itself open your therapy records to the court.",
    },
    { kind: "clause", id: "decisions", text: "Decisions about staying together, separating or marrying are yours, not mine." },
    { kind: "field", id: "names", label: "Names of everyone in therapy", lines: 2 },
    { kind: "signature", caption: "Signature of adult in therapy" },
    { kind: "signature", caption: "Signature of adult in therapy" },
    { kind: "signature", caption: "Signature of adult in therapy (if more)" },
  ],
};
