// What the research (docs/research/client-forms/*.md › Open questions) could not
// settle. Each form lists the ones that touch it, and the library shows them as
// "Needs your attorney's review", never as settled. Same list in docs/research.md
// › Client forms › Needs your attorney's review.

export const REVIEW = {
  aamft:
    "AAMFT Code of Ethics citations come from the 2015 code, read on a state mirror (aamft.org needs a login). The current code may be newer and its numbers may differ.",
  ocr:
    "The HHS Office for Civil Rights address, phone and website were not read on hhs.gov (it blocked our research). Check them on hhs.gov/ocr before you use the form.",
  collections:
    "Whether Illinois lets you give a collection agency anything without the client's written consent (740 ILCS 110/11(iv) may cover only some providers; 740 ILCS 110/5) is unsettled. The form asks for that consent; have your attorney check the wording and any interest or late fee.",
  taglines:
    "Section 1557 (45 CFR 92.11(b)) asks for taglines in English and the 15 languages most spoken in Illinois. This form prints English and Spanish only: add HHS's translated taglines before you use it, if you take Medicare, Medicaid or other federal money.",
  npp_model:
    "HHS's model privacy notice could not be read (hhs.gov blocked our research), and the 2024 reproductive-health paragraphs were left out after Purl v. HHS (2025). Compare with HHS's current model notice.",
  copy_fees:
    "Record copy fees: 740 ILCS 110/4(b) (a reasonable fee), 735 ILCS 5/8-2001 caps and HIPAA's cost-based fee may all apply. Which one limits your fee was not settled.",
  aca: "ACA Code of Ethics citations are the 2014 code; a revision is under way and its numbers may change.",
} as const;
