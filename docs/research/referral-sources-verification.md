# Referral sources: verification log

Checked 2026-11-02 for `docs/research/referral-sources.json` v1.0.

How: one NPPES API v2.1 request per search string, `taxonomy_description=<string>&state=IL&limit=50`, 1.5 s apart. "IL results" counts results with an Illinois address. A code counts as verified when it appeared as a taxonomy on a live Illinois result **and** is in the NUCC code set v26.1 (`nucc_taxonomy_261.csv` from nucc.org). NPPES does not accept a code as `taxonomy_description`, so codes were matched from the results.

| Type | Search string | IL results | Codes kept | Date |
|---|---|---|---|---|
| family_medicine | Family Medicine | 48 of 50 | 207Q00000X, 207QG0300X, 207QA0401X, 207QH0002X, 363LF0000X | 2026-11-02 |
| internal_medicine | Internal Medicine | 45 of 50 | 207R00000X, 207RG0300X | 2026-11-02 |
| pediatrics | Pediatrics | 49 of 50 | 208000000X, 2080A0000X, 2080P0204X, 363LP0200X | 2026-11-02 |
| ob_gyn | Obstetrics & Gynecology | 46 of 50 | 207V00000X, 207VM0101X, 207VG0400X, 363LX0001X | 2026-11-02 |
| midwives | Midwife | 50 of 50 | 176B00000X, 367A00000X | 2026-11-02 |
| midwives | Advanced Practice Midwife | 46 of 50 | 176B00000X, 367A00000X | 2026-11-02 |
| geriatrics | Geriatric Medicine | 46 of 50 | 207QG0300X, 207RG0300X | 2026-11-02 |
| nurse_practitioners_pas | Nurse Practitioner | 49 of 50 | 363L00000X, 363LP2300X, 363LG0600X, 363A00000X, 363AM0700X | 2026-11-02 |
| nurse_practitioners_pas | Physician Assistant | 46 of 50 | 363L00000X, 363LP2300X, 363LG0600X, 363A00000X, 363AM0700X | 2026-11-02 |
| urgent_care | Urgent Care | 50 of 50 | 261QU0200X | 2026-11-02 |
| oncology | Hematology & Oncology | 45 of 50 | 207RH0003X, 207RX0202X, 2085R0001X, 207VX0201X | 2026-11-02 |
| oncology | Medical Oncology | 44 of 50 | 207RH0003X, 207RX0202X, 2085R0001X, 207VX0201X | 2026-11-02 |
| oncology | Radiation Oncology | 45 of 50 | 207RH0003X, 207RX0202X, 2085R0001X, 207VX0201X | 2026-11-02 |
| oncology | Gynecologic Oncology | 48 of 50 | 207RH0003X, 207RX0202X, 2085R0001X, 207VX0201X | 2026-11-02 |
| cardiology | Cardiovascular Disease | 46 of 50 | 207RC0000X | 2026-11-02 |
| neurology | Neurology | 44 of 50 | 2084N0400X, 2084N0402X | 2026-11-02 |
| gastroenterology | Gastroenterology | 43 of 50 | 207RG0100X | 2026-11-02 |
| endocrinology | Endocrinology, Diabetes & Metabolism | 47 of 50 | 207RE0101X | 2026-11-02 |
| rheumatology | Rheumatology | 44 of 50 | 207RR0500X | 2026-11-02 |
| pain_medicine | Pain Medicine | 47 of 50 | 208VP0000X, 208VP0014X, 207LP2900X, 2081P2900X | 2026-11-02 |
| pain_medicine | Interventional Pain Medicine | 47 of 50 | 208VP0000X, 208VP0014X, 207LP2900X, 2081P2900X | 2026-11-02 |
| sleep_medicine | Sleep Medicine | 49 of 50 | 207RS0012X, 2084S0012X | 2026-11-02 |
| fertility | Reproductive Endocrinology | 48 of 50 | 207VE0102X | 2026-11-02 |
| plastic_surgery | Plastic Surgery | 46 of 50 | 208200000X, 2086S0122X | 2026-11-02 |
| dermatology | Dermatology | 49 of 50 | 207N00000X, 207ND0101X | 2026-11-02 |
| genetic_counselors | Genetic Counselor | 50 of 50 | 170300000X | 2026-11-02 |
| physiatry | Physical Medicine & Rehabilitation | 47 of 50 | 208100000X | 2026-11-02 |
| psychiatry | Psychiatry | 46 of 50 | 2084P0800X, 363LP0808X | 2026-11-02 |
| child_psychiatry | Psychiatry | 46 of 50 | 2084P0804X | 2026-11-02 |
| pmhnp | Psychiatry | 46 of 50 | 363LP0808X | 2026-11-02 |
| addiction_medicine | Addiction Medicine | 46 of 50 | 2084A0401X, 207RA0401X, 2083A0300X, 207LA0401X | 2026-11-02 |
| therapists | Social Worker | 50 of 50 | 1041C0700X, 106H00000X, 101YP2500X, 101YM0800X | 2026-11-02 |
| therapists | Marriage & Family Therapist | 47 of 50 | 1041C0700X, 106H00000X, 101YP2500X, 101YM0800X | 2026-11-02 |
| therapists | Counselor | 50 of 50 | 1041C0700X, 106H00000X, 101YP2500X, 101YM0800X | 2026-11-02 |
| psychologists | Psychologist | 46 of 50 | 103T00000X, 103TC0700X | 2026-11-02 |
| group_practices | Social Worker | 50 of 50 | 1041C0700X, 103T00000X, 106H00000X, 101YM0800X | 2026-11-02 |
| group_practices | Psychologist | 46 of 50 | 1041C0700X, 103T00000X, 106H00000X, 101YM0800X | 2026-11-02 |
| group_practices | Marriage & Family Therapist | 47 of 50 | 1041C0700X, 103T00000X, 106H00000X, 101YM0800X | 2026-11-02 |
| group_practices | Counselor | 50 of 50 | 1041C0700X, 103T00000X, 106H00000X, 101YM0800X | 2026-11-02 |
| mental_health_programs | Mental Health | 50 of 50 | 261QM0801X, 283Q00000X, 323P00000X, 273R00000X | 2026-11-02 |
| mental_health_programs | Psychiatric Residential Treatment Facility | 50 of 50 | 261QM0801X, 283Q00000X, 323P00000X, 273R00000X | 2026-11-02 |
| mental_health_programs | Psychiatric Hospital | 50 of 50 | 261QM0801X, 283Q00000X, 323P00000X, 273R00000X | 2026-11-02 |
| mental_health_programs | Psychiatric Unit | 50 of 50 | 261QM0801X, 283Q00000X, 323P00000X, 273R00000X | 2026-11-02 |
| palliative_care | Hospice and Palliative Medicine | 42 of 50 | 207RH0002X, 207PH0002X, 207LH0002X | 2026-11-02 |
| hospice | Hospice Care, Community Based | 50 of 50 | 251G00000X, 315D00000X | 2026-11-02 |
| hospice | Hospice, Inpatient | 17 of 18 | 251G00000X, 315D00000X | 2026-11-02 |
| home_health | Home Health | 50 of 50 | 251E00000X | 2026-11-02 |
| doulas | Doula | 48 of 50 | 374J00000X | 2026-11-02 |
| lactation_consultants | Lactation Consultant | 50 of 50 | 163WL0100X, 174N00000X | 2026-11-02 |
| pelvic_floor_pt | Physical Therapist | 49 of 50 | 225100000X | 2026-11-02 |
| dietitians | Dietitian, Registered | 49 of 50 | 133V00000X | 2026-11-02 |
| rehab_therapists | Physical Therapist | 49 of 50 | 225100000X, 225X00000X, 235Z00000X | 2026-11-02 |
| rehab_therapists | Occupational Therapist | 50 of 50 | 225100000X, 225X00000X, 235Z00000X | 2026-11-02 |
| rehab_therapists | Speech-Language Pathologist | 48 of 50 | 225100000X, 225X00000X, 235Z00000X | 2026-11-02 |
| bodywork | Chiropractor | 50 of 50 | 111N00000X, 171100000X, 225700000X | 2026-11-02 |
| bodywork | Acupuncturist | 50 of 50 | 111N00000X, 171100000X, 225700000X | 2026-11-02 |
| bodywork | Massage Therapist | 50 of 50 | 111N00000X, 171100000X, 225700000X | 2026-11-02 |
| sports_medicine | Sports Medicine | 47 of 50 | 207XX0005X, 207RS0010X, 2081S0010X | 2026-11-02 |

## Refused or dropped

| What | Result | Decision |
|---|---|---|
| `Chaplain` | NPPES: "No taxonomy codes found"; no NUCC code | chaplains are `manual` |
| `Bariatric Surgery` | NPPES: "No taxonomy codes found"; `Bariatric` only matches obesity medicine (207RB0002X, 207QB0002X) | bariatric programs are `public_list` |
| `Clinical Social Worker` | refused (known since 2026-10-29) | `Social Worker` is used |
| 363LA2200X (NP, Adult Health) | in NUCC, not seen in IL results | dropped |
| 2084H0002X (Psych & Neuro, Hospice and Palliative) | in NUCC, not seen in IL results | dropped |
| 207PS0010X, 2084S0010X (sports medicine) | in NUCC, not seen in IL results | dropped |
| `Hospice` | returns physicians as well as agencies | `Hospice Care, Community Based` and `Hospice, Inpatient` are used |

Codes already inside an original specialty (207Q*, 207V*, 2080*, 2084P08*, 103T*, and the internal medicine codes) stay there, so cards already on the board keep their kind: geriatrics, fertility, child psychiatry, psychiatric NPs and psychologists point at those specialties.

## CMS datasets

| Dataset | Id | IL rows | Date |
|---|---|---|---|
| Home Health Care Agencies | 6jpm-sxkc | 531 | 2026-11-02 |
| Hospice - General Information | yc9t-dgbk | 149 | 2026-11-02 |

OpenStreetMap tags (`amenity=place_of_worship`, `shop=funeral_directors`, `amenity=community_centre`, `amenity=library`, `leisure=fitness_centre`, `sport=yoga`) are standard Map Features tags; not queried live in this pass.
