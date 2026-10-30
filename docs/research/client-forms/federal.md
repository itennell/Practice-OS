# Client forms research: federal rules (checked 2026-10-29)

Checked: 2026-10-29. Primary text was read from eCFR (current as of 10/28/2026), federalregister.gov, govinfo.gov (court opinion), law.cornell.edu, docs.fcc.gov, pcisecuritystandards.org and phqscreeners.com.
**hhs.gov returned 403 (Akamai) for every page**, through both Firecrawl and WebFetch. So the OCR model NPP headings and the email FAQ are taken from search-result extracts plus one HHS PDF that did load (safeguards.pdf). These are marked "unverified-direct".

## Who is a HIPAA covered entity (applies to npp, npp_ack, records_request)

- 45 CFR 160.103 says a *covered entity* includes "A health care provider who transmits any health information in electronic form in connection with a transaction covered by this subchapter." https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-160/subpart-A/section-160.103
- **A cash-only therapist** who never bills insurance electronically, never checks eligibility electronically, and has no billing service doing either for her **is probably not a covered entity**. Handing the client a superbill to file herself does not by itself make her one. Once she sends one standard electronic transaction (claim, eligibility check, claim status), HIPAA applies for good.
- Template advice: still offer the NPP to everyone as best practice. Many state laws and payer contracts expect one, and it costs nothing.

---

## npp — Notice of Privacy Practices (45 CFR 164.520)

URL for every 164.520 row: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.520
Applies to: all HIPAA covered entities (see above). The "Part 2" rows apply only if the practice receives or keeps records from a federally assisted SUD program (see the part2 note).

| element_id | element | citation | quote | checked | level | applies_to | plain-language wording |
|---|---|---|---|---|---|---|---|
| plain_language | Notice written in plain language | 164.520(b)(1) | "must provide a notice that is written in plain language and that contains the elements required by this paragraph." | 2026-10-29 | required | covered entities | (Style rule, not a sentence: short words, short sentences.) |
| header | Fixed header statement | 164.520(b)(1)(i) | "THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY." | 2026-10-29 | required | covered entities | Use the exact header text, in capitals. Do not reword it. |
| tpo_uses | Treatment, payment and operations, with at least one example each | 164.520(b)(1)(ii)(A) | "A description, including at least one example, of the types of uses and disclosures ... for each of the following purposes: treatment, payment, and health care operations." | 2026-10-29 | required | covered entities | We use your information to treat you (for example, to talk with your doctor), to get paid (for example, to send a bill to your insurance), and to run our practice (for example, to check the quality of our care). |
| other_permitted_uses | Every other use or disclosure allowed or required without authorization | 164.520(b)(1)(ii)(B) | "A description of each of the other purposes for which the covered entity is permitted or required by this subpart to use or disclose protected health information without the individual's written authorization." | 2026-10-29 | required | covered entities | We may also share your information when the law requires it, such as to prevent a serious threat to safety, to report abuse, for public health, to answer a court order, or for workers' compensation. |
| more_stringent_law | Descriptions follow stricter law (for example Part 2, state law) | 164.520(b)(1)(ii)(C) | "is prohibited or materially limited by other applicable law, such as 42 CFR part 2, the description ... must reflect the more stringent law" | 2026-10-29 | required | covered entities (Part 2 text since 2024) | When a stricter law protects your information, such as Illinois mental health law, we follow the stricter law. |
| sufficient_detail | Enough detail to give real notice under HIPAA and other law | 164.520(b)(1)(ii)(D) | "the description must include sufficient detail to place the individual on notice of the uses and disclosures that are permitted or required by this subpart and other applicable law" | 2026-10-29 | required | covered entities | (Drafting rule: name the actual situations, not just the categories.) |
| authorization_required | Uses that need written authorization (psychotherapy notes, marketing, sale of PHI); all other uses need authorization; authorization can be revoked | 164.520(b)(1)(ii)(E) | "a statement that other uses and disclosures not described in the notice will be made only with the individual's written authorization, and a statement that the individual may revoke an authorization" | 2026-10-29 | required | covered entities | We need your written permission to share psychotherapy notes, to use your information for marketing, or to sell it. You can take back your permission in writing at any time. |
| repro_prohibited_uses | (VACATED) Ban on uses for reproductive health care investigations | 164.520(b)(1)(ii)(F) | eCFR still prints it, but Purl v. HHS, N.D. Tex. 2:24-CV-228-Z (June 18, 2025): "45 C.F.R. Section 164.520(b)(1)(ii)(F), (G), and (H) are VACATED." | 2026-10-29 | do_not_include | nobody (vacated nationwide) | Leave this out. |
| repro_attestation | (VACATED) Uses that need an attestation under 164.509 | 164.520(b)(1)(ii)(G) | Same order as above. | 2026-10-29 | do_not_include | nobody (vacated) | Leave this out. |
| redisclosure_warning | (VACATED as a requirement) Warning that shared information may be redisclosed | 164.520(b)(1)(ii)(H) | Same order as above. eCFR text: "potential for information disclosed pursuant to this subpart to be subject to redisclosure by the recipient" | 2026-10-29 | best_practice | optional for all | Once we share your information as the law allows, the person who receives it may share it again, and HIPAA may no longer protect it. |
| fundraising_optout | Separate statement if the practice fundraises (with opt-out) | 164.520(b)(1)(iii)(A) | "the covered entity may contact the individual to raise funds for the covered entity and the individual has a right to opt out of receiving such communications" | 2026-10-29 | required (only if fundraising) | covered entities that fundraise | We may contact you to ask for donations. You can tell us to stop at any time. |
| plan_sponsor / underwriting | Group health plan / health plan statements | 164.520(b)(1)(iii)(B)-(C) | "the group health plan ... may disclose protected health information to the sponsor of the plan" | 2026-10-29 | not_applicable | health plans only | Not used for a therapy practice. |
| part2_proceedings | Part 2 SUD records not used against the client in proceedings without consent or a court order | 164.520(b)(1)(iii)(D) | "Substance use disorder treatment records received from programs subject to 42 CFR part 2 ... shall not be used or disclosed in civil, criminal, administrative, or legislative proceedings against the individual unless based on written consent, or a court order" | 2026-10-29 | required (since 2026-02-16, if the practice receives or keeps Part 2 records) | covered entities holding Part 2 records | If we have substance use treatment records from a federally assisted program, we will not use them against you in a court or government case unless you agree in writing or a judge orders it after you get notice. |
| part2_fundraising | Part 2 records used for fundraising: first a clear chance to opt out | 164.520(b)(1)(iii)(E) | "the individual must first be provided with a clear and conspicuous opportunity to elect not to receive any fundraising communications." | 2026-10-29 | required (if applicable) | entities holding Part 2 records that fundraise | We will not use your substance use treatment records to ask for donations unless we first give you a clear way to say no. |
| right_restrict | Right to ask for limits; not required to agree, except self-pay restriction to a health plan | 164.520(b)(1)(iv)(A); 164.522(a)(1)(vi) | "including a statement that the covered entity is not required to agree to a requested restriction, except in case of a disclosure restricted under § 164.522(a)(1)(vi)" | 2026-10-29 | required | covered entities | You can ask us to limit what we share. We do not have to say yes, but we must say yes if you pay in full yourself and ask us not to tell your health plan. |
| right_confidential_comms | Right to confidential communications (other address or method) | 164.520(b)(1)(iv)(B) | "The right to receive confidential communications of protected health information as provided by § 164.522(b), as applicable" | 2026-10-29 | required | covered entities | You can ask us to contact you in a certain way, like only by cell phone or at a different address, and we will say yes to reasonable requests. |
| right_access | Right to inspect and get a copy | 164.520(b)(1)(iv)(C) | "The right to inspect and copy protected health information as provided by § 164.524" | 2026-10-29 | required | covered entities | You can see or get a copy of your records. Ask us in writing, and we will answer within 30 days. |
| right_amend | Right to ask for a correction | 164.520(b)(1)(iv)(D) | "The right to amend protected health information as provided by § 164.526" | 2026-10-29 | required | covered entities | You can ask us to fix information you think is wrong or missing. If we say no, we will tell you why in writing. |
| right_accounting | Right to a list of disclosures | 164.520(b)(1)(iv)(E) | "The right to receive an accounting of disclosures of protected health information as provided by § 164.528" | 2026-10-29 | required | covered entities | You can ask for a list of the times we shared your information in the last six years, other than for treatment, payment and running our practice. |
| right_paper_copy | Right to a paper copy, even if the notice was given electronically | 164.520(b)(1)(iv)(F) | "to obtain a paper copy of the notice from the covered entity upon request." | 2026-10-29 | required | covered entities | You can ask for a paper copy of this notice at any time, even if you got it by email. |
| duty_privacy_breach | Duty to protect PHI, give this notice, and tell clients about breaches | 164.520(b)(1)(v)(A) | "required by law to maintain the privacy of protected health information, to provide individuals with notice of its legal duties and privacy practices, and to notify affected individuals following a breach" | 2026-10-29 | required | covered entities | The law requires us to keep your information private, give you this notice, and tell you if your information is ever exposed in a breach. |
| duty_follow_notice | Duty to follow the notice now in effect | 164.520(b)(1)(v)(B) | "A statement that the covered entity is required to abide by the terms of the notice currently in effect" | 2026-10-29 | required | covered entities | We must follow the version of this notice that is in effect now. |
| reserve_right_change | Right to change the notice and how a revised notice is provided | 164.520(b)(1)(v)(C) | "a statement that it reserves the right to change the terms of its notice ... The statement must also describe how it will provide individuals with a revised notice." | 2026-10-29 | required (if changes will apply to existing records) | covered entities | We may change this notice, and the change will apply to all information we have. New versions will be on our website and in our office, and we will give you a copy if you ask. |
| complaints | Complaints to the practice and to HHS, how to file, no retaliation | 164.520(b)(1)(vi) | "individuals may complain to the covered entity and to the Secretary ... and a statement that the individual will not be retaliated against for filing a complaint." | 2026-10-29 | required | covered entities | If you think we broke your privacy rights, you can complain to us or to the U.S. Department of Health and Human Services. We will never treat you worse for complaining. |
| contact_person | Name or title, plus phone, of the privacy contact | 164.520(b)(1)(vii) | "the name, or title, and telephone number of a person or office to contact for further information" | 2026-10-29 | required | covered entities | Questions? Call [Privacy Officer name or title] at [phone]. |
| effective_date | Effective date, not earlier than the publish date | 164.520(b)(1)(viii) | "the date on which the notice is first in effect, which may not be earlier than the date on which the notice is printed or otherwise published." | 2026-10-29 | required | covered entities | This notice takes effect on [date]. |
| optional_limits | Practice may describe stricter limits it chooses (not limits on required-by-law disclosures) | 164.520(b)(2)(i) | "if a covered entity elects to limit the uses or disclosures ... the covered entity may describe its more limited uses or disclosures in its notice" | 2026-10-29 | best_practice | covered entities | We choose to share less than the law allows in these ways: [list]. |
| revise_on_material_change | Revise promptly on a material change | 164.520(b)(3) | "must promptly revise and distribute its notice whenever there is a material change" | 2026-10-29 | required | covered entities | (Process rule: Aeon reminds the clinician to update the notice when practices change.) |
| deliver_first_service | Give it by the first service, including telehealth | 164.520(c)(2)(i)(A) | "No later than the date of the first service delivery, including service delivered electronically" | 2026-10-29 | required | covered providers with direct treatment relationship | (Process: send with intake paperwork.) |
| post_in_office | Have copies at the office and post it | 164.520(c)(2)(iii) | "Post the notice in a clear and prominent location where it is reasonable to expect individuals seeking service ... to be able to read the notice" | 2026-10-29 | required (if physical office) | covered providers with an office | (Process: print and post in the waiting area.) |
| post_on_website | Post on the practice website | 164.520(c)(3)(i) | "must prominently post its notice on the web site and make the notice available electronically through the web site." | 2026-10-29 | required (if website has service info) | covered entities with a website | (Process: link it in the site footer.) |
| electronic_delivery | Email only with agreement; paper copy if email fails; telehealth-first gets it automatically | 164.520(c)(3)(ii)-(iii) | "may provide the notice ... by e-mail, if the individual agrees to electronic notice and such agreement has not been withdrawn." | 2026-10-29 | required | covered entities | You agreed to get this notice by email. You can ask for paper instead at any time. |
| retain_copies | Keep copies of notices and acknowledgments (6 years per 164.530(j)) | 164.520(e) | "by retaining copies of the notices issued by the covered entity and, if applicable, any written acknowledgments of receipt" | 2026-10-29 | required | covered entities | (Process: store each version with its dates.) |
| language_tagline | Language-assistance tagline notice included with the NPP | 45 CFR 92.11(c)(5)(ii) | "Notice of privacy practices required by 45 CFR 164.520" | 2026-10-29 | required (Section 1557 covered entities only) | recipients of federal financial assistance | See nondiscrimination_notice. |

**Compliance dates (NPP):**
- The 2024 Part 2 rule (89 FR 12472) took effect 2024-04-16, with compliance by **2026-02-16**. Source: "must comply with the applicable requirements of this final rule by February 16, 2026." https://www.federalregister.gov/documents/2024/02/16/2024-02544/confidentiality-of-substance-use-disorder-sud-patient-records
- The 2024 reproductive-health rule (89 FR 32976) said: "must comply with the applicable requirements of 45 CFR 164.520 in this final rule by February 16, 2026." https://www.federalregister.gov/documents/2024/04/26/2024-08503/hipaa-privacy-rule-to-support-reproductive-health-care-privacy
- **Purl v. HHS**, No. 2:24-CV-228-Z (N.D. Tex., June 18, 2025, ECF 110, Kacsmaryk J.) vacated the whole 2024 reproductive health rule nationwide. It kept the rule's 164.520 changes ("are severed and shall stand"), except (b)(1)(ii)(F), (G) and (H), which it vacated. https://www.govinfo.gov/content/pkg/USCOURTS-txnd-2_24-cv-00228/pdf/USCOURTS-txnd-2_24-cv-00228-2.pdf
- What this means for the template:
  - Do NOT include reproductive-health prohibition or attestation language.
  - The redisclosure warning (H) is optional. eCFR still prints all three paragraphs; a court vacatur does not edit the CFR text.
  - The Part 2 content ((ii)(C), (D), (iii)(D), (E)) is in force from 2026-02-16, but only matters when Part 2 records are actually received or kept.
- HHS OCR model NPPs (unverified-direct, because hhs.gov is blocked):
  - Main page: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/model-notices-privacy-practices/index.html. It lists "Revised February 2026 Model NPPs" (Health Care Provider, Health Plan, Part 2 Patient Notice), released about 2026-02-13 per secondary reports.
  - Older set: https://www.hhs.gov/guidance/document/model-privacy-notices (Booklet / Layered / Full Page / Text, in English and Spanish). Layered provider PDF: https://www.hhs.gov/sites/default/files/ocr/privacy/hipaa/npp_layered_hc_provider.pdf
  - Model section headings (from the 2013 model, from memory, not verified against the 2026 file): title "Your Information. Your Rights. Our Responsibilities."; "Your Rights"; "Your Choices"; "Our Uses and Disclosures"; "Our Responsibilities"; "Changes to the Terms of This Notice"; and a final block "Other Instructions for Notice" with the effective date, the privacy-officer contact and the entities the notice covers.

---

## npp_ack — Acknowledgment of receipt (45 CFR 164.520(c)(2)(ii), (e))

URL: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.520
Applies to: covered health care providers with a direct treatment relationship.

| element_id | element | citation | quote | checked | level | applies_to | plain-language wording |
|---|---|---|---|---|---|---|---|
| good_faith_ack | Good-faith effort to get a written acknowledgment | 164.520(c)(2)(ii) | "make a good faith effort to obtain a written acknowledgment of receipt of the notice" | 2026-10-29 | required (the effort, not the signature) | covered providers | I received a copy of [Practice]'s Notice of Privacy Practices. |
| ack_not_condition | Client is not required to sign; care is not refused | 164.520(c)(2)(ii) (implied); 164.506(b) consent optional | (no direct text; signing is not a condition of treatment) | 2026-10-29 | best_practice | covered providers | Signing only shows you got the notice. You can still get care if you choose not to sign. |
| ack_fields | Client name, signature or e-sign, date, notice version or effective date | 164.520(e) | "any written acknowledgments of receipt of the notice" | 2026-10-29 | best_practice | covered providers | Name / Signature / Date / Notice version dated [effective date]. |
| refusal_documentation | If not obtained: record the effort and the reason | 164.520(c)(2)(ii) | "if not obtained, document its good faith efforts to obtain such acknowledgment and the reason why the acknowledgment was not obtained" | 2026-10-29 | required | covered providers | Office use: the client did not sign because [reason]. We offered on [date] by [method]. |
| emergency_exception | No acknowledgment needed in an emergency | 164.520(c)(2)(ii) | "Except in an emergency treatment situation" | 2026-10-29 | required | covered providers | (Rare for outpatient therapy; skip in UI.) |
| electronic_ack | E-acknowledgment applies to electronic notice too | 164.520(c)(3)(iii) | "The requirements in paragraph (c)(2)(ii) of this section apply to electronic notice." | 2026-10-29 | required | covered providers (telehealth-first) | Check the box to confirm you received the notice by email or through our portal. |
| retain_ack | Keep acknowledgments or refusal notes (6 years, 164.530(j)) | 164.520(e) | "documentation of good faith efforts to obtain such written acknowledgment" | 2026-10-29 | required | covered providers | (Process: store with the client file.) |

---

## records_request — Right of access request form (45 CFR 164.524)

URL: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.524
Applies to: covered entities. (A non-covered cash practice falls under the state record-access law instead; Illinois is in a separate research file.)

| element_id | element | citation | quote | checked | level | applies_to | plain-language wording |
|---|---|---|---|---|---|---|---|
| written_request_ok | May require written requests if clients are told | 164.524(b)(1) | "may require individuals to make requests for access in writing, provided that it informs individuals of such a requirement." | 2026-10-29 | required (the notice of requirement) | covered entities | Please make your request in writing using this form or by email. |
| what_records | Which records (designated record set) and dates | 164.524(a)(1) | "inspect and obtain a copy of protected health information about the individual in a designated record set" | 2026-10-29 | best_practice (form field) | covered entities | Which records do you want, and from what dates? |
| psychotherapy_notes_excluded | Psychotherapy notes are excluded from the right of access | 164.524(a)(1)(i) | "except for: (i) Psychotherapy notes" | 2026-10-29 | required (limit) | covered entities | Your right to records does not include your therapist's separate private session notes (psychotherapy notes). You will still get your treatment record. |
| litigation_excluded | Information prepared for a legal case is excluded | 164.524(a)(1)(ii) | "Information compiled in reasonable anticipation of, or for use in, a civil, criminal, or administrative action or proceeding." | 2026-10-29 | required (limit) | covered entities | Papers prepared for a court case are not part of this request. |
| inspect_or_copy | Inspect, get a copy, or both | 164.524(c)(1) | "including inspection or obtaining a copy, or both" | 2026-10-29 | best_practice (form field) | covered entities | Do you want to look at your records, get a copy, or both? |
| form_format | Form and format asked for if readily producible; electronic if kept electronically | 164.524(c)(2)(i)-(ii) | "in the form and format requested by the individual, if it is readily producible in such form and format" | 2026-10-29 | required | covered entities | How do you want your copy: paper, PDF by email, or on a USB drive? |
| summary_option | Summary instead, only if agreed in advance (with fee) | 164.524(c)(2)(iii) | "The individual agrees in advance to such a summary or explanation" | 2026-10-29 | required (if offered) | covered entities | Would you like a summary instead of the full record? There may be a fee, and we will tell you the amount first. |
| delivery_method | Mail, pickup, or email; arrange time and place | 164.524(c)(3)(i) | "arranging with the individual for a convenient time and place to inspect or obtain a copy ... or mailing the copy" | 2026-10-29 | best_practice (form field) | covered entities | Where should we send it, or when would you like to pick it up? |
| third_party_direction | Send the copy to a person the client names: written, signed, names the person and the address | 164.524(c)(3)(ii) | "The individual's request must be in writing, signed by the individual, and clearly identify the designated person and where to send the copy" | 2026-10-29 | required | covered entities | To send your records to someone else, sign here and write their name and where to send them. |
| timeline_30_days | Act within 30 days | 164.524(b)(2)(i) | "must act on a request for access no later than 30 days after receipt of the request" | 2026-10-29 | required | covered entities | We will respond within 30 days of getting your request. |
| one_extension | One 30-day extension, with written reasons and a new date | 164.524(b)(2)(ii) | "may extend the time for such actions by no more than 30 days ... a written statement of the reasons for the delay and the date" | 2026-10-29 | required | covered entities | If we need more time, we will tell you in writing why and the date you will get them, no more than 30 extra days. |
| fees_cost_based | Reasonable cost-based fee: labor for copying, supplies, postage, summary prep only | 164.524(c)(4) | "may impose a reasonable, cost-based fee, provided that the fee includes only the cost of: (i) Labor for copying" | 2026-10-29 | required (limit) | covered entities | We may charge only what it costs us to copy and mail your records. We will tell you the cost before we start. |
| denial_written | Denial in writing, in plain language: basis, review rights, how to complain, contact | 164.524(d)(2) | "The denial must be in plain language and contain: (i) The basis for the denial" | 2026-10-29 | required | covered entities | If we say no to any part, we will tell you why in writing and how to ask for a review or make a complaint. |
| unreviewable_denials | Unreviewable grounds (excluded info, confidential non-provider source, etc.) | 164.524(a)(2) | "may deny an individual access without providing the individual an opportunity for review" | 2026-10-29 | required (limit) | covered entities | (Internal reference for denial letters.) |
| reviewable_denials | Reviewable: danger to life or safety; harm to someone else named; harm through a personal representative | 164.524(a)(3)(i) | "reasonably likely to endanger the life or physical safety of the individual or another person" | 2026-10-29 | required (limit) | covered entities | (Denial letter: you can ask another licensed professional to review this decision.) |
| review_process | Review by a licensed professional not involved in the denial | 164.524(a)(4), (d)(4) | "reviewed by a licensed health care professional who is designated by the covered entity ... who did not participate in the original decision" | 2026-10-29 | required | covered entities | A different licensed professional who was not part of our decision will review it. |
| partial_access | Release what can be released | 164.524(d)(1) | "give the individual access to any other protected health information requested, after excluding" | 2026-10-29 | required | covered entities | We will give you everything we can, even if we hold back one part. |
| where_else | If not held here, say where to ask | 164.524(d)(3) | "the covered entity knows where the requested information is maintained, the covered entity must inform the individual where to direct the request" | 2026-10-29 | required | covered entities | If we do not have these records, we will tell you who does. |
| document_roles | Document the record sets and who handles requests | 164.524(e) | "The titles of the persons or offices responsible for receiving and processing requests for access" | 2026-10-29 | required | covered entities | (Settings field: records contact.) |
| id_verification | Verify identity before release | 164.514(h) (not fetched) | n/a | 2026-10-29 | required (separate section) | covered entities | We will check your ID before we give you your records. |

---

## gfe — Good Faith Estimate (45 CFR 149.610) — already built; list only

URL: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-G/section-149.610
Applies to: any state-licensed provider, for uninsured or self-pay clients. This does NOT depend on HIPAA status.

| element_id | element | citation | quote | checked | level | applies_to |
|---|---|---|---|---|---|---|
| patient_name_dob | Patient name and date of birth | 149.610(c)(1)(i) | "Patient name and date of birth" | 2026-10-29 | required | uninsured/self-pay |
| primary_service | Primary service in clear language, with scheduled date | (c)(1)(ii) | "Description of the primary item or service in clear and understandable language" | 2026-10-29 | required | same |
| itemized_list | Itemized list grouped by provider | (c)(1)(iii) | "Itemized list of items or services, grouped by each provider or facility" | 2026-10-29 | required | same |
| codes_charges | Diagnosis codes, service codes, expected charges | (c)(1)(iv) | "Applicable diagnosis codes, expected service codes, and expected charges associated with each listed item or service" | 2026-10-29 | required | same |
| provider_ids | Name, NPI, TIN, state(s) and location | (c)(1)(v) | "Name, National Provider Identifier, and Tax Identification Number of each provider or facility" | 2026-10-29 | required | same |
| separate_scheduling | Services scheduled separately | (c)(1)(vi) | "List of items or services that the convening provider ... anticipates will require separate scheduling" | 2026-10-29 | required | same |
| disclaimer_additional | Disclaimer: other services may be recommended | (c)(1)(viii) | "there may be additional items or services the convening provider or convening facility recommends" | 2026-10-29 | required | same |
| disclaimer_estimate | Disclaimer: only an estimate | (c)(1)(ix) | "is only an estimate regarding items or services reasonably expected to be furnished" | 2026-10-29 | required | same |
| disclaimer_dispute | Disclaimer: dispute right if billed "substantially in excess" (see 149.620) | (c)(1)(x) | "right to initiate the patient-provider dispute resolution process if the actual billed charges are substantially in excess" | 2026-10-29 | required | same |
| disclaimer_not_contract | Disclaimer: not a contract | (c)(1)(xi) | "the good faith estimate is not a contract" | 2026-10-29 | required | same |
| recurring_scope | Recurring services: scope, frequency, max 12 months | (b)(1)(x) | "must not exceed 12 months" | 2026-10-29 | required (recurring) | same |
| availability_notice | Notice that GFEs are available: website, office, orally, accessible formats and languages | (b)(1)(iii) | "prominently displayed (and easily searchable from a public search engine) on the convening provider's ... website, in the office" | 2026-10-29 | required | same |
| timing | 1 business day (scheduled 3+ days out), 3 business days (10+ days out, or on request) | (b)(1)(vi) | "Not later than 3 business days after the date of the request." | 2026-10-29 | required | same |
| written_delivery | Written, on paper or electronically, as the client asks | (e)(1) | "must be provided in written form either on paper or electronically" | 2026-10-29 | required | same |
| medical_record | Part of the medical record; give copies on request (6 years) | (f)(1) | "considered part of the patient's medical record" | 2026-10-29 | required | same |

Note: the 1557 tagline also applies to GFEs (92.11(c)(5)(ix)), for Section 1557 covered entities only.

---

## nondiscrimination_notice — Section 1557 notices (45 CFR 92.10, 92.11)

URLs:
- 92.10: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-92/subpart-A/section-92.10
- 92.11: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-92/subpart-A/section-92.11
- 92.4: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-92/subpart-A/section-92.4
- 92.1: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-92/subpart-A/section-92.1

**Who must post it:** a *covered entity* (92.4), meaning "A recipient of Federal financial assistance". For a solo therapist this is triggered by Medicaid payments, or **Medicare Part B payments: HHS reversed its old position in the 2024 final rule** (89 FR 37522, sec. III): "funds provided via the current Part B program meet the longstanding definition of 'Federal financial assistance'". Part-B-only providers had to comply by **2025-05-06**. https://www.federalregister.gov/documents/2024/05/06/2024-08711/nondiscrimination-in-health-programs-and-activities
A private-pay or commercial-insurance-only practice with no Medicare or Medicaid is usually NOT covered. The notices are then best practice only.

**Deadlines (92.1(b)):** 92.10 notice "Within 120 days of July 5, 2024" (= 2024-11-02). 92.11 taglines "Within one year of July 5, 2024" (= 2025-07-05). The Section 1557 Coordinator (92.7) is required only with 15 or more employees.

| element_id | element | citation | quote | checked | level | applies_to | plain-language wording |
|---|---|---|---|---|---|---|---|
| no_discrimination_statement | Does not discriminate (race, color, national origin incl. LEP and primary language, sex, age, disability) | 92.10(a)(1)(i) | "The covered entity does not discriminate on the basis of race, color, national origin (including limited English proficiency and primary language), sex ... age, or disability" | 2026-10-29 | required | 1557 covered entities | We do not treat anyone differently because of race, color, national origin, language, sex, age, or disability. |
| disability_aids | Free reasonable modifications and auxiliary aids (interpreters, braille, large print), on time | 92.10(a)(1)(ii) | "provides reasonable modifications for individuals with disabilities, and appropriate auxiliary aids and services ... free of charge and in a timely manner" | 2026-10-29 | required | same | If you have a disability, we offer free help, like sign language interpreters or large-print forms. |
| language_services | Free language help (translation, interpretation) | 92.10(a)(1)(iii) | "provides language assistance services, including electronic and written translated documents and oral interpretation, free of charge" | 2026-10-29 | required | same | If English is not your main language, we offer free interpreters and translated papers. |
| how_to_request | How to ask for these services | 92.10(a)(1)(iv) | "How to obtain from the covered entity the reasonable modifications, appropriate auxiliary aids and services, and language assistance services" | 2026-10-29 | required | same | To ask for this help, call [phone] or email [email]. |
| coordinator_contact | Section 1557 Coordinator contact (if applicable) | 92.10(a)(1)(v) | "The contact information for the covered entity's Section 1557 Coordinator ... (if applicable)" | 2026-10-29 | required (15+ employees) | same | Our civil rights contact is [name], [phone]. |
| grievance_procedure | Grievance procedure and how to file (if applicable) | 92.10(a)(1)(vi) | "The availability of the covered entity's grievance procedure ... and how to file a grievance (if applicable)" | 2026-10-29 | required (15+ employees) | same | If you think we treated you unfairly, you can file a complaint with us at [contact]. |
| ocr_complaint | How to complain to HHS OCR | 92.10(a)(1)(vii) | "Details on how to file a discrimination complaint with OCR in the Department" | 2026-10-29 | required | same | You can also complain to the U.S. HHS Office for Civil Rights online at ocrportal.hhs.gov, by phone at 1-800-368-1019, or by mail. (Verify the current OCR contact details.) |
| website_pointer | Where the website shows this | 92.10(a)(1)(viii) | "How to access the covered entity's website, if it has one" | 2026-10-29 | required | same | This notice is also on our website at [URL]. |
| delivery_92_10 | Annually, on request, on the website, posted on site in 20-pt or larger sans serif | 92.10(a)(2) | "in no smaller than 20-point sans serif font" | 2026-10-29 | required | same | (Layout rule: poster 20pt+ sans serif.) |
| tagline_statement | Notice of availability: free language and auxiliary aids | 92.11(a) | "provides language assistance services and appropriate auxiliary aids and services free of charge" | 2026-10-29 | required | same | Free language help and disability help are available. Call [phone]. |
| tagline_15_languages | In English and the top 15 LEP languages of the state | 92.11(b) | "in English and at least the 15 languages most commonly spoken by individuals with limited English proficiency of the relevant State" | 2026-10-29 | required | same | (Use the HHS-provided translated taglines for Illinois; the list is in the state file.) |
| tagline_where | Attached to the NPP, intake forms, GFE and billing, complaint forms, consent forms, handbooks | 92.11(c)(5) | "Notice of privacy practices required by 45 CFR 164.520; (iii) Application and intake forms" | 2026-10-29 | required | same | (Template rule: append the tagline block to these documents.) |
| tagline_opt_out | Deemed compliance: annual opt-out or primary-language documentation | 92.11(d) | "provide the individual with the option to opt out of receipt of the notice ... in their primary language" | 2026-10-29 | required (alternative) | same | Do you want to stop getting this language notice? You can still ask for free language help anytime. |
| combine_notices | May combine with the Title VI / 504 / Title IX / Age Act notices | 92.10(b) | "may combine the content of the notice required by paragraph (a) of this section with the notices required by" | 2026-10-29 | best_practice | same | (One combined notice.) |

---

## ada_notice — ADA Title III (28 CFR part 36)

URLs:
- 36.303: https://www.ecfr.gov/current/title-28/chapter-I/part-36/subpart-C/section-36.303
- 36.302: https://www.ecfr.gov/current/title-28/chapter-I/part-36/subpart-C/section-36.302

Applies to: a private therapy office, which is a "place of public accommodation" (a professional office of a health care provider). **There is no required ADA notice form.** All the wording below is best practice; the underlying duties are required.

| element_id | element | citation | quote | checked | level | applies_to | plain-language wording |
|---|---|---|---|---|---|---|---|
| effective_comm | Provide auxiliary aids for effective communication, including to companions | 36.303(c)(1) | "A public accommodation shall furnish appropriate auxiliary aids and services where necessary to ensure effective communication with individuals with disabilities." | 2026-10-29 | required (duty); notice best_practice | all private practices | If you are deaf, hard of hearing, blind, or have a speech disability, tell us what help you need and we will arrange it at no cost. |
| consult_person | Consult the person on which aid they need | 36.303(c)(1)(ii) | "should consult with individuals with disabilities whenever possible to determine what type of auxiliary aid is needed" | 2026-10-29 | best_practice | same | Tell us what works best for you, such as an interpreter, captions, or large print. |
| no_bring_own_interpreter | Do not require the client to bring an interpreter; do not rely on companions or minors except in narrow cases | 36.303(c)(2)-(4) | "shall not require an individual with a disability to bring another individual to interpret for him or her." | 2026-10-29 | required | same | You do not need to bring your own interpreter. |
| relay_calls | Answer relay calls; voicemail and IVR must work with TTY and relay | 36.303(d)(1), (d)(4) | "shall respond to telephone calls from a telecommunications relay service ... in the same manner that it responds to other telephone calls." | 2026-10-29 | required | same (and Front Desk phone) | We accept calls through relay services (dial 711). |
| no_surcharge | No extra charge for aids | 36.301(c) (not fetched) | n/a | 2026-10-29 | required | same | There is never an extra charge for this help. |
| service_animals | Service animals allowed; only 2 questions; no documentation | 36.302(c)(1), (c)(6) | "may ask if the animal is required because of a disability and what work or task the animal has been trained to perform." | 2026-10-29 | required (duty); notice best_practice | same | Service animals are welcome. We will not ask for papers. |
| service_animal_exceptions | May exclude if out of control or not housebroken | 36.302(c)(2) | "The animal is out of control and the animal's handler does not take effective action to control it" | 2026-10-29 | required (limit) | same | A service animal must stay under your control. |
| no_animal_fee | No pet fee for service animals | 36.302(c)(8) | "shall not ask or require an individual with a disability to pay a surcharge" | 2026-10-29 | required | same | There is no fee for service animals. |
| reasonable_mods | Reasonable modifications of policies | 36.302(a) (not quoted) | n/a | 2026-10-29 | required | same | If a rule of ours is hard for you because of a disability, ask us and we will try to change it. |

---

## communication_consent — Texting, email, phone (TCPA + HIPAA)

URLs:
- 47 USC 227: https://www.law.cornell.edu/uscode/text/47/227
- 47 CFR 64.1200: https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200
- FCC 15-72 (2015 Omnibus TCPA Order, adopted 2015-06-18), para 141: https://docs.fcc.gov/public/attachments/FCC-15-72A1.pdf
- 164.522: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.522
- OCR email guidance: https://www.hhs.gov/sites/default/files/ocr/privacy/hipaa/understanding/special/healthit/safeguards.pdf (FAQ page: https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-permit-health-care-providers-to-use-email-to-discuss-health-issues-with-patients/index.html, unverified-direct)

| element_id | element | citation | quote | checked | level | applies_to | plain-language wording |
|---|---|---|---|---|---|---|---|
| tcpa_prior_express_consent | Autodialed or prerecorded calls and texts to cell phones need prior express consent | 47 USC 227(b)(1)(A) | "to make any call (other than a call made for emergency purposes or made with the prior express consent of the called party) using any automatic telephone dialing system" | 2026-10-29 | required (if ATDS or prerecorded) | anyone texting or calling | By giving us your cell number, you agree that we may text or call you about your appointments. |
| hipaa_number_is_consent | Giving a number to a HIPAA provider = prior express consent for HIPAA "health care" calls within scope | FCC 15-72 para 141 | "provision of a phone number to a healthcare provider constitutes prior express consent for healthcare calls subject to HIPAA" | 2026-10-29 | required (scope limit) | HIPAA covered entities | (Basis for reminders. Still capture explicit consent; see below.) |
| health_care_message_no_written | "Health care" messages from a covered entity are exempt from the written-consent rule for telemarketing | 47 CFR 64.1200(a)(2) | "or a call that delivers a 'health care' message made by, or on behalf of, a 'covered entity' or its 'business associate,'" | 2026-10-29 | required (scope) | covered entities | (Marketing texts, for example "new group starting", need prior express WRITTEN consent.) |
| free_to_end_user_exemption | Exemption with no consent if free to recipient: appointment reminders only, under 160 chars, 1/day and 3/week max, name and contact, STOP opt-out | 47 CFR 64.1200(a)(9)(iv) | "strictly limited to those for the following purposes: appointment and exam confirmations and reminders" | 2026-10-29 | required (if relying on it) | healthcare providers | [Practice] reminder: your appointment is Tue 3pm. Reply STOP to opt out. |
| no_billing_in_exempt | Exempt texts may not include billing or financial content | 64.1200(a)(9)(iv)(D) | "may not include accounting, billing, debt-collection, or other financial content" | 2026-10-29 | required (if relying on (a)(9)) | same | (Rule: keep balance reminders out of reminder texts.) |
| revocation_any_method | Consent revocable by any reasonable means; STOP etc.; honor within 10 business days | 64.1200(a)(10) | "must be honored within a reasonable time not to exceed ten business days from receipt of such request." | 2026-10-29 | required | anyone texting | You can stop texts at any time by replying STOP or telling us. |
| written_consent_marketing | Prior express written consent for marketing or telemarketing | 64.1200(f)(9) | "an agreement, in writing, bearing the signature of the person called that clearly authorizes the seller to deliver" | 2026-10-29 | required (marketing only) | anyone | I agree to get news and offers from [Practice] by text. This is not required to get care. |
| hipaa_confidential_comms | Must allow and accommodate reasonable requests for other means or locations | 164.522(b)(1)(i) | "must accommodate reasonable requests by individuals to receive communications of protected health information ... by alternative means or at alternative locations." | 2026-10-29 | required | covered providers | Tell us how you want us to contact you: text, email, phone, or mail, and which number or address. |
| may_require_writing | May ask for the request in writing; may not ask why | 164.522(b)(2)(i), (iii) | "may not require an explanation from the individual as to the basis for the request" | 2026-10-29 | required | covered providers | You do not have to tell us why. |
| unencrypted_email_ok | Unencrypted email or text allowed with safeguards; warn of risk, client decides | OCR safeguards FAQ Q3; 164.530(c) | "the provider can alert the patient of those risks, and let the patient decide whether to continue e-mail communications." | 2026-10-29 | best_practice (risk warning) | covered providers | Regular email and texts are not fully secure. Someone could read them. Do you still want us to use them? |
| minimum_info | Limit what is put in unencrypted messages | OCR safeguards FAQ Q3 | "limiting the amount or type of information disclosed through the unencrypted e-mail" | 2026-10-29 | best_practice | covered providers | Our texts will only have the date and time, never details about your care. |
| voicemail_permission | Permission to leave a voicemail and how detailed | 164.522(b) (applied) | n/a | 2026-10-29 | best_practice | covered providers | May we leave a voicemail? Just our name and number, or appointment details too? |
| security_rule_note | Security Rule still applies to ePHI that is sent | 45 CFR 164 subpart C | n/a | 2026-10-29 | required | covered entities | (Twilio needs a BAA before PHI goes in texts.) |

Note: Facebook v. Duguid (U.S. 2021) narrowed "ATDS". A Twilio send from a stored list may not be an ATDS, but capture consent anyway, because of state mini-TCPAs and the FCC 2023-24 consent rules.

---

## card_authorization — Card on file (PCI DSS, Reg E)

URLs:
- PCI FAQ 1280: https://www.pcisecuritystandards.org/faq/articles/Frequently_Asked_Question/Can-card-verification-codes-values-be-stored-for-card-on-file-or-recurring-transactions
- PCI FAQ 1091 (truncation): https://www.pcisecuritystandards.org/faq/articles/Frequently_Asked_Question/What-are-acceptable-formats-for-truncation-of-primary-account-numbers
- Reg E 12 CFR 1005.10: https://www.ecfr.gov/current/title-12/chapter-X/part-1005/subpart-A/section-1005.10

| element_id | element | citation | quote | checked | level | applies_to | plain-language wording |
|---|---|---|---|---|---|---|---|
| no_cvv_storage | Never store CVV/CVC after authorization, even encrypted or with consent | PCI DSS v4.0.1 Req 3.3.1 / 3.3.1.2; FAQ 1280 | "It is not permitted to retain card verification codes once the specific purchase or transaction for which it was collected has been authorized." | 2026-10-29 | required | any merchant accepting cards | We never keep the 3- or 4-digit security code on file. |
| no_cvv_on_form | Customer permission does not allow CVV storage | FAQ 1280 | "A customer's request or approval for an entity to retain a card verification code has no validity for PCI DSS" | 2026-10-29 | required | same | (Template rule: the form has NO CVV field.) |
| pan_unreadable | PAN unreadable wherever stored; mask on display (first 6 / last 4 max shown); best is to let the processor vault it (token) | PCI DSS v4.0.1 Req 3.4.1, 3.5.1 (standard not fetched; PDF behind license) | n/a | 2026-10-29 | required | same | Your card is stored securely by our payment processor, [Stripe/Square]. We only see the last 4 digits. |
| truncation_formats | Acceptable truncation, e.g. 16-digit PAN: keep at most "First 8, any other 4" | FAQ 1091 | "At least 4 digits removed. Maximum digits which may be retained: 'First 8, any other 4'" | 2026-10-29 | required (if truncating) | same | (Display rule: show only the last 4.) |
| no_paper_full_pan | Do not keep paper forms with the full card number; enter it into the processor and destroy the paper | PCI DSS Req 3, 9.4 (not fetched) | n/a | 2026-10-29 | best_practice | same | (Process: Aeon never stores the card number; clients enter it in the processor's page.) |
| cof_consent_terms | Card-on-file consent: what charges (late cancel or no-show fee, session fee, balance), amount or how it is set, when charged, how long it lasts, how to cancel, receipt sent | Visa/Mastercard stored-credential framework (card network rules; not public primary text) | n/a | 2026-10-29 | best_practice | same | I allow [Practice] to charge my card on file for session fees, unpaid balances, and the $[X] late-cancel fee. I can cancel this in writing at any time. |
| cardholder_fields | Cardholder name, last 4, brand, expiry, billing ZIP, signature or e-sign, date | best practice | n/a | 2026-10-29 | best_practice | same | Name on card / Card ending in / Expires / Billing ZIP / Signature / Date. |
| reg_e_debit_recurring | Recurring debits from a consumer account (debit card or ACH) must be authorized in a signed or authenticated writing, and the client gets a copy | 12 CFR 1005.10(b) | "may be authorized only by a writing signed or similarly authenticated by the consumer. The person that obtains the authorization shall provide a copy to the consumer." | 2026-10-29 | required (recurring debit or ACH only) | merchants taking preauthorized debits | We will email you a copy of this authorization. |
| hsa_fsa_note | HSA/FSA cards are debit-like; treat them as debit for Reg E | inference | n/a | 2026-10-29 | best_practice | same | (Treat HSA/FSA like debit.) |

---

## phq9 — PHQ-9 / gad7 — GAD-7 licensing

URLs: https://www.phqscreeners.com/select-screener and https://www.phqscreeners.com/terms

| element_id | element | citation | quote | checked | level | applies_to | plain-language wording |
|---|---|---|---|---|---|---|---|
| free_to_use | No permission needed to reproduce, translate, display or distribute | phqscreeners.com/select-screener | "no permission is required to reproduce, translate, display or distribute them." | 2026-10-29 | required (license basis) | anyone | (No license fee and no sign-up.) |
| copyright_exempt | Exempt from Pfizer's general copyright restrictions | phqscreeners.com/terms | "content found on the PHQ Screeners site is expressly exempted from Pfizer's general copyright restrictions" | 2026-10-29 | required (license basis) | anyone | n/a |
| attribution_line | Attribution: the site requires none. The printed forms themselves carry a line (from memory, not verified): "Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute." | form PDFs (not fetched) | Authors per the site: "Robert L. Spitzer, MD, Janet B.W. Williams, DSW, and Kurt Kroenke, MD" | 2026-10-29 | best_practice | anyone | Keep the developer line from the official form at the bottom, unchanged. |
| self_report_verify | Terms: responses must be verified by the clinician; diagnosis is clinical | phqscreeners.com/terms | "all responses should be verified by the clinician and a definitive diagnosis made on clinical grounds" | 2026-10-29 | best_practice | anyone | (Scope: Aeon only delivers the form and stores the score; the clinician interprets. Aeon gives no clinical advice.) |
| no_warranty | Pfizer disclaims warranties; use at your own risk | phqscreeners.com/terms | "ACCESS TO AND USE OF THE PHQ AND GAD-7 SCREENERS IS AT YOUR OWN RISK." | 2026-10-29 | best_practice | anyone | n/a |
| use_official_text | Use the official wording and translations unchanged (do not reword the items) | best practice | n/a | 2026-10-29 | best_practice | anyone | n/a |
| phq9_item9_safety | PHQ-9 item 9 asks about self-harm thoughts. Any nonzero answer must route to the crisis path, the same as lib/safety.ts | project rule (HB 1806 / safety) | n/a | 2026-10-29 | best_practice (strongly) | Practice-OS | (Show 988 / 911 right away and alert the clinician.) |

gad7: same license rows as phq9 (the same site and terms cover the "PHQ and GAD-7 screeners"); there is no item-9 safety row.

---

## part2 — 42 CFR Part 2 applicability (one line)

Part 2 covers only a federally assisted *program*: one that "holds itself out as providing, and provides, substance use disorder diagnosis, treatment, or referral for treatment" (42 CFR 2.11).
- "Federally assisted" includes being a Medicare participating provider (2.12(b)(2)(i)).
- So a general solo therapist who does not advertise SUD treatment is usually not a Part 2 program.
- She still needs the NPP Part 2 statements if she *receives* Part 2 records from such a program.

Sources: https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2/subpart-B/section-2.11 and https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2/subpart-B/section-2.12

---

## Open questions / disputed

1. **hhs.gov is blocked (403)** from both Firecrawl and WebFetch. The model NPP section headings (2013 set) are from memory, and the Feb 2026 revised model's headings and exact Part 2 wording are unverified. A human should open https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/model-notices-privacy-practices/index.html in a browser.
2. **Purl vacatur vs eCFR:** eCFR (as of 2026-10-28) still prints 164.520(b)(1)(ii)(F)-(H) and 164.509. Unknown: whether HHS appealed, or published a conforming rule removing them. The template follows the court order (omit F and G; H optional).
3. **Redisclosure (H) also vacated.** This is a surprise: it was a general statement, not reproductive-specific. Keeping it as optional best practice seems safe.
4. **Section 1557, 2024 rule status in 2025-26:** several courts stayed or vacated the gender-identity parts (Tennessee v. Becerra, Texas v. Becerra and others). HHS may have proposed rescinding or narrowing the rule in 2025 (not verified). The notice and tagline duties (92.10/92.11) were not the main target, but check for a 2025-26 rulemaking that drops the tagline mandate (the 2020 rule had dropped taglines).
5. **Medicare Part B = FFA:** the 2024 reinterpretation is a policy position in the preamble, not regulation text. It could be reversed without notice-and-comment. Verify that it is still HHS's position.
6. **Ciox Health v. Azar (D.D.C. 2020)** limited the third-party directive in 164.524(c)(3)(ii) to electronic copies of PHI in an EHR, and the cost-based fee cap does not apply to third-party directives. eCFR text is unchanged. HHS's 2021 proposed Privacy Rule changes (access 15 days, etc.) were never finalized as far as known; verify.
7. **PCI DSS requirement numbers** (3.3.1, 3.3.1.2, 3.4.1, 3.5.1) come from v4.0.1 knowledge; the PDF was not fetched (license click-through). The FAQ quotes are verified.
8. **TCPA ATDS scope after Duguid:** whether Twilio list-sends count as ATDS. Also the FCC's revocation rule (64.1200(a)(10)) parts delayed to 2026+; check the current effective status of the "revoke-all" provision.
9. **PHQ attribution line** on the official PDFs was not fetched; it is quoted from memory.
10. **HIPAA covered-entity status** for a cash-only practice that uses a third-party biller or a clearinghouse for even one claim: that makes it covered. Onboarding should ask "Do you or anyone for you send insurance claims or check eligibility electronically?"
