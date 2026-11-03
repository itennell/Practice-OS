# Referral sources: verification log

Checked 2026-11-02 for `docs/research/referral-sources.json` v1.0.

How: one NPPES API v2.1 request per search string, `taxonomy_description=<string>&state=IL&limit=200`, 2 s apart. "IL results" counts results with an Illinois address. The codes column lists only this type's kept codes that came back on that search's own results (as any taxonomy on a result); every kept code is also in the NUCC code set v26.1 (`nucc_taxonomy_261.csv` from nucc.org), with its NUCC label. NPPES does not accept a code as `taxonomy_description`, so codes were matched from the results. Codes are unique per type; a type marked shared_with uses another type's codes.

| Type | Search string | IL results | Codes this search returned (NUCC label) | Date |
|---|---|---|---|---|
| family_medicine | Family Medicine | 191 of 200 | 207Q00000X Family Medicine; 207QA0401X Family Medicine, Addiction Medicine; 207QH0002X Family Medicine, Hospice and Palliative Medicine; 363LF0000X Nurse Practitioner, Family | 2026-11-02 |
| internal_medicine | Internal Medicine | 186 of 200 | 207R00000X Internal Medicine | 2026-11-02 |
| pediatrics | Pediatrics | 194 of 200 | 208000000X Pediatrics; 2080A0000X Pediatrics, Adolescent Medicine; 2080P0204X Pediatrics, Pediatric Emergency Medicine; 363LP0200X Nurse Practitioner, Pediatrics | 2026-11-02 |
| ob_gyn | Obstetrics & Gynecology | 188 of 200 | 207V00000X Obstetrics & Gynecology; 207VM0101X Obstetrics & Gynecology, Maternal & Fetal Medicine; 207VG0400X Obstetrics & Gynecology, Gynecology; 363LX0001X Nurse Practitioner, Obstetrics & Gynecology | 2026-11-02 |
| midwives | Midwife | 155 of 159 | 176B00000X Midwife; 367A00000X Advanced Practice Midwife | 2026-11-02 |
| midwives | Advanced Practice Midwife | 188 of 200 | 176B00000X Midwife; 367A00000X Advanced Practice Midwife | 2026-11-02 |
| geriatrics | Geriatric Medicine | 188 of 200 | 207QG0300X Family Medicine, Geriatric Medicine; 207RG0300X Internal Medicine, Geriatric Medicine | 2026-11-02 |
| nurse_practitioners_pas | Nurse Practitioner | 198 of 200 | 363L00000X Nurse Practitioner; 363LP2300X Nurse Practitioner, Primary Care; 363LG0600X Nurse Practitioner, Gerontology; 363A00000X Physician Assistant | 2026-11-02 |
| nurse_practitioners_pas | Physician Assistant | 187 of 200 | 363L00000X Nurse Practitioner; 363A00000X Physician Assistant; 363AM0700X Physician Assistant, Medical | 2026-11-02 |
| urgent_care | Urgent Care | 200 of 200 | 261QU0200X Clinic/Center, Urgent Care | 2026-11-02 |
| oncology | Hematology & Oncology | 177 of 200 | 207RH0003X Internal Medicine, Hematology & Oncology; 207RX0202X Internal Medicine, Medical Oncology; 2085R0001X Radiology, Radiation Oncology; 207VX0201X Obstetrics & Gynecology, Gynecologic Oncology | 2026-11-02 |
| oncology | Medical Oncology | 178 of 200 | 207RH0003X Internal Medicine, Hematology & Oncology; 207RX0202X Internal Medicine, Medical Oncology; 2085R0001X Radiology, Radiation Oncology; 207VX0201X Obstetrics & Gynecology, Gynecologic Oncology | 2026-11-02 |
| oncology | Radiation Oncology | 173 of 200 | 207RH0003X Internal Medicine, Hematology & Oncology; 207RX0202X Internal Medicine, Medical Oncology; 2085R0001X Radiology, Radiation Oncology; 207VX0201X Obstetrics & Gynecology, Gynecologic Oncology | 2026-11-02 |
| oncology | Gynecologic Oncology | 131 of 138 | 207RH0003X Internal Medicine, Hematology & Oncology; 207RX0202X Internal Medicine, Medical Oncology; 2085R0001X Radiology, Radiation Oncology; 207VX0201X Obstetrics & Gynecology, Gynecologic Oncology | 2026-11-02 |
| cardiology | Cardiovascular Disease | 177 of 200 | 207RC0000X Internal Medicine, Cardiovascular Disease | 2026-11-02 |
| neurology | Neurology | 170 of 200 | 2084N0400X Psychiatry & Neurology, Neurology; 2084N0402X Psychiatry & Neurology, Neurology with Special Qualifications in Child Neurology | 2026-11-02 |
| gastroenterology | Gastroenterology | 176 of 200 | 207RG0100X Internal Medicine, Gastroenterology | 2026-11-02 |
| endocrinology | Endocrinology, Diabetes & Metabolism | 185 of 200 | 207RE0101X Internal Medicine, Endocrinology, Diabetes & Metabolism | 2026-11-02 |
| rheumatology | Rheumatology | 181 of 200 | 207RR0500X Internal Medicine, Rheumatology | 2026-11-02 |
| pain_medicine | Pain Medicine | 185 of 200 | 208VP0000X Pain Medicine, Pain Medicine; 208VP0014X Pain Medicine, Interventional Pain Medicine; 207LP2900X Anesthesiology, Pain Medicine; 2081P2900X Physical Medicine & Rehabilitation, Pain Medicine | 2026-11-02 |
| pain_medicine | Interventional Pain Medicine | 189 of 200 | 208VP0000X Pain Medicine, Pain Medicine; 208VP0014X Pain Medicine, Interventional Pain Medicine; 207LP2900X Anesthesiology, Pain Medicine; 2081P2900X Physical Medicine & Rehabilitation, Pain Medicine | 2026-11-02 |
| sleep_medicine | Sleep Medicine | 182 of 200 | 207RS0012X Internal Medicine, Sleep Medicine; 2084S0012X Psychiatry & Neurology, Sleep Medicine | 2026-11-02 |
| fertility | Reproductive Endocrinology | 170 of 177 | 207VE0102X Obstetrics & Gynecology, Reproductive Endocrinology | 2026-11-02 |
| plastic_surgery | Plastic Surgery | 182 of 200 | 208200000X Plastic Surgery; 2086S0122X Surgery, Plastic and Reconstructive Surgery | 2026-11-02 |
| dermatology | Dermatology | 188 of 200 | 207N00000X Dermatology; 207ND0101X Dermatology, MOHS-Micrographic Surgery; 207NP0225X Dermatology, Pediatric Dermatology; 207NS0135X Dermatology, Procedural Dermatology | 2026-11-02 |
| genetic_counselors | Genetic Counselor | 200 of 200 | 170300000X Genetic Counselor, MS | 2026-11-02 |
| physiatry | Physical Medicine & Rehabilitation | 190 of 200 | 208100000X Physical Medicine & Rehabilitation | 2026-11-02 |
| psychiatry | Psychiatry | 188 of 200 | 2084P0800X Psychiatry & Neurology, Psychiatry | 2026-11-02 |
| child_psychiatry | Psychiatry | 188 of 200 | 2084P0804X Psychiatry & Neurology, Child & Adolescent Psychiatry | 2026-11-02 |
| pmhnp | Psychiatry | 188 of 200 | 363LP0808X Nurse Practitioner, Psychiatric/Mental Health | 2026-11-02 |
| addiction_medicine | Addiction Medicine | 193 of 200 | 2084A0401X Psychiatry & Neurology, Addiction Medicine; 207RA0401X Internal Medicine, Addiction Medicine; 2083A0300X Preventive Medicine, Addiction Medicine; 207LA0401X Anesthesiology, Addiction Medicine | 2026-11-02 |
| therapists | Social Worker | 198 of 200 | 1041C0700X Social Worker, Clinical; 106H00000X Marriage & Family Therapist; 101YP2500X Counselor, Professional; 101YM0800X Counselor, Mental Health | 2026-11-02 |
| therapists | Marriage & Family Therapist | 195 of 200 | 1041C0700X Social Worker, Clinical; 106H00000X Marriage & Family Therapist; 101YP2500X Counselor, Professional; 101YM0800X Counselor, Mental Health | 2026-11-02 |
| therapists | Counselor | 198 of 200 | 1041C0700X Social Worker, Clinical; 106H00000X Marriage & Family Therapist; 101YP2500X Counselor, Professional; 101YM0800X Counselor, Mental Health | 2026-11-02 |
| psychologists | Psychologist | 193 of 200 | 103T00000X Psychologist; 103TC0700X Psychologist, Clinical | 2026-11-02 |
| group_practices | Social Worker | 198 of 200 | (codes are therapists's) | 2026-11-02 |
| group_practices | Psychologist | 193 of 200 | (codes are therapists's) | 2026-11-02 |
| group_practices | Marriage & Family Therapist | 195 of 200 | (codes are therapists's) | 2026-11-02 |
| group_practices | Counselor | 198 of 200 | (codes are therapists's) | 2026-11-02 |
| mental_health_programs | Mental Health | 198 of 200 | 261QM0801X Clinic/Center, Mental Health (Including Community Mental Health Center) | 2026-11-02 |
| mental_health_programs | Psychiatric Residential Treatment Facility | 52 of 52 | 261QM0801X Clinic/Center, Mental Health (Including Community Mental Health Center); 283Q00000X Psychiatric Hospital; 323P00000X Psychiatric Residential Treatment Facility | 2026-11-02 |
| mental_health_programs | Psychiatric Hospital | 72 of 73 | 261QM0801X Clinic/Center, Mental Health (Including Community Mental Health Center); 283Q00000X Psychiatric Hospital; 323P00000X Psychiatric Residential Treatment Facility; 273R00000X Psychiatric Unit | 2026-11-02 |
| mental_health_programs | Psychiatric Unit | 200 of 200 | 261QM0801X Clinic/Center, Mental Health (Including Community Mental Health Center); 283Q00000X Psychiatric Hospital; 273R00000X Psychiatric Unit | 2026-11-02 |
| palliative_care | Hospice and Palliative Medicine | 173 of 200 | 207RH0002X Internal Medicine, Hospice and Palliative Medicine; 207PH0002X Emergency Medicine, Hospice and Palliative Medicine; 207LH0002X Anesthesiology, Hospice and Palliative Medicine | 2026-11-02 |
| hospice | Hospice Care, Community Based | 199 of 200 | 251G00000X Hospice Care, Community Based; 315D00000X Hospice, Inpatient | 2026-11-02 |
| hospice | Hospice, Inpatient | 17 of 18 | 251G00000X Hospice Care, Community Based; 315D00000X Hospice, Inpatient | 2026-11-02 |
| home_health | Home Health | 200 of 200 | 251E00000X Home Health | 2026-11-02 |
| doulas | Doula | 198 of 200 | 374J00000X Doula | 2026-11-02 |
| lactation_consultants | Lactation Consultant | 194 of 200 | 163WL0100X Registered Nurse, Lactation Consultant; 174N00000X Lactation Consultant, Non-RN | 2026-11-02 |
| pelvic_floor_pt | Physical Therapist | 199 of 200 | (codes are rehab_therapists's) | 2026-11-02 |
| dietitians | Dietitian, Registered | 195 of 200 | 133V00000X Dietitian, Registered | 2026-11-02 |
| rehab_therapists | Physical Therapist | 199 of 200 | 225100000X Physical Therapist; 225X00000X Occupational Therapist; 235Z00000X Speech-Language Pathologist | 2026-11-02 |
| rehab_therapists | Occupational Therapist | 197 of 200 | 225100000X Physical Therapist; 225X00000X Occupational Therapist; 235Z00000X Speech-Language Pathologist | 2026-11-02 |
| rehab_therapists | Speech-Language Pathologist | 197 of 200 | 225100000X Physical Therapist; 225X00000X Occupational Therapist; 235Z00000X Speech-Language Pathologist | 2026-11-02 |
| bodywork | Chiropractor | 200 of 200 | 111N00000X Chiropractor; 171100000X Acupuncturist; 225700000X Massage Therapist | 2026-11-02 |
| bodywork | Acupuncturist | 197 of 200 | 111N00000X Chiropractor; 171100000X Acupuncturist; 225700000X Massage Therapist | 2026-11-02 |
| bodywork | Massage Therapist | 200 of 200 | 111N00000X Chiropractor; 171100000X Acupuncturist; 225700000X Massage Therapist | 2026-11-02 |
| sports_medicine | Sports Medicine | 181 of 200 | 207XX0005X Orthopaedic Surgery, Sports Medicine; 207RS0010X Internal Medicine, Sports Medicine; 2081S0010X Physical Medicine & Rehabilitation, Sports Medicine | 2026-11-02 |

## Group practices (NPI-2)

Same searches with `enumeration_type=NPI-2`: organisations carry the therapists' and psychologists' codes as their primary taxonomy (count of primary), so group_practices stays an NPPES type with `shared_with: therapists`.

| Search string | IL organisations | Top primary codes |
|---|---|---|
| Social Worker | 198 | 1041C0700X (152); 2084P0800X (11); 101YM0800X (5); 104100000X (4) |
| Psychologist | 196 | 103TC0700X (111); 103T00000X (41); 2084P0800X (7); 103K00000X (7) |
| Marriage & Family Therapist | 193 | 106H00000X (120); 101YP2500X (15); 101YM0800X (14); 1041C0700X (11) |
| Counselor | 197 | 101YP2500X (71); 101YM0800X (68); 1041C0700X (11); 101Y00000X (10) |

## Refused or dropped

| What | Result | Decision |
|---|---|---|
| `Chaplain` | NPPES: "No taxonomy codes found"; no NUCC code | chaplains are `manual` |
| `Bariatric Surgery` | NPPES: "No taxonomy codes found"; `Bariatric` only matches obesity medicine (207RB0002X, 207QB0002X) | bariatric programs are `public_list` |
| `Clinical Social Worker` | refused (known since 2026-10-29) | `Social Worker` is used |
| `Hospice`, `Dietitian` | worked, but returned physicians / duplicates of the narrower strings | not used; `Hospice Care, Community Based`, `Hospice, Inpatient` and `Dietitian, Registered` are |
| 363LA2200X (NP, Adult Health) | in NUCC, not seen in IL results | dropped |
| 2084H0002X (Psych & Neuro, Hospice and Palliative) | in NUCC, not seen in IL results | dropped |
| 207PS0010X, 2084S0010X (sports medicine) | in NUCC, not seen in IL results | dropped |
| 207ND0900X (Dermatopathology), 207NI0002X (Dermatological Immunology) | laboratory specialties | excluded; dermatology uses exact codes |

Codes inside an original specialty's prefix (207Q*, 207V*, 2080*, 2084P08*, 103T*) and the internal medicine geriatrics code stay found by that specialty, so cards already on the board keep their kind; geriatrics, fertility, child psychiatry, psychiatric NPs and psychologists own those codes in the catalog and point at the original specialty.

## CMS datasets

| Dataset | Id | IL rows | Date |
|---|---|---|---|
| Home Health Care Agencies | 6jpm-sxkc | 531 | 2026-11-02 |
| Hospice - General Information | yc9t-dgbk | 149 | 2026-11-02 |

## Regulations opened

- 42 CFR 418.64(d)(1): hospice bereavement counseling "up to 1 year following the death of the patient" (eCFR, read 2026-11-02).
- 42 CFR 482.90(a)(1): a transplant candidate "must receive a psychosocial evaluation, if possible" before the waiting list (eCFR, read 2026-11-02).

OpenStreetMap tags (`amenity=place_of_worship`, `shop=funeral_directors`, `amenity=community_centre`, `amenity=library`, `leisure=fitness_centre`, `sport=yoga`) are standard Map Features tags; not queried live in this pass.
