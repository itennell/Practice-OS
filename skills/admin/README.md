# Admin helper

Compliance calendar (license renewal, CE hours, CAQH re-attestation, Medicare revalidation, PLLC annual report, quarterly taxes), "how do I" guides, credentialing prep from payer PDF forms, and Good Faith Estimates.

Aeon prepares forms; the clinician signs and submits them. Aeon never signs, attests or submits a government, payer or CAQH form.

Agent skills: `SKILL.md` (practice admin through the MCP tools) and `state-research/SKILL.md` (researching a state outside Illinois).

## How-do-i guides (references/)

Short numbered checklists, each with the official page and its sources. Steps that start with `[You]` are ones only the clinician can do. The app renders them at /how-do-i, and any agent can read the files directly.

- `references/illinois-pllc.md`: form and keep up an Illinois PLLC
- `references/npi-type-1-vs-2.md`: Type 1 vs Type 2 NPI
- `references/caqh-reattestation.md`: re-attest on CAQH ProView
- `references/medicare-pecos.md`: enroll in Medicare through PECOS
- `references/illinois-impact.md`: enroll in Illinois Medicaid (IMPACT)

Format: frontmatter (`title`, `summary`, `official_url`, `last_verified`, `sources` as `- label | https://url`), then `## ` sections holding `1. ` steps or `- ` bullets. `lib/guides.ts` refuses anything else.

## Clinical-legal duties (note only)

Aeon never advises on clinical judgment. For duties such as duty to warn (Illinois permits disclosure to protect someone from a clear, imminent risk of serious injury, 740 ILCS 110/11), safety planning and documentation standards, Aeon only points the clinician to the statute and her licensing board. These get no reminders and no advice. The reporting deadlines that do have a clock (child abuse, adult abuse, FOID) are rules in `lib/compliance`, and Aeon only reminds; the clinician decides.
