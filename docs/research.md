# Build the licensed clinician's missing co-owner

Caseload Builder should be a portable GitHub repo of Agent Skills plus a TypeScript MCP server. It acts as the business partner an **independently licensed** clinician never had: an LCSW, LCPC, LMFT, licensed psychologist or PMHNP who owns a solo practice, and later a small group. No open-source project and no commercial product covers the job end to end. EHRs (SimplePractice, TherapyNotes) handle notes and claims plumbing. Networks (Alma, Headway, Grow, Rula) handle credentialing and billing, but only under their own contracts and tax IDs. AI scribes handle notes. Enterprise voice agents serve orthopedics and urgent care, not therapists. That leaves the clinician to do client acquisition, inquiry conversion, independent credentialing, the cross-tool deadline calendar, and the "how do I even do this" business layer by hand. In SimplePractice's survey, **43%** of independent clinicians had no formal business training ([Business Wire](https://secure.businesswire.com/news/home/20260513758800/en/SimplePractice-Releases-First-of-Its-Kind-Report-on-Independent-Mental-Health-Practice)). Three open building blocks are worth starting from: the **Agent Skills folder format plus the MCP reference servers** as the repo skeleton, **Stedi's healthcare API** (free test mode with test claims that return denied ERAs, a signed BAA on pay-as-you-go, and its own MCP server), and the free **NPPES NPI Registry and CMS public enrollment data**, which feed both referral discovery and credentialing checks. Your architecture holds up. Splitting skills into PHI-free ones that run on any agent and PHI-touching ones that need a BAA-covered deployment is the right call. Two facts sharpen it. Anthropic's BAA excludes Skills and MCP connectors, so even a BAA-covered Claude account cannot run PHI through the skills layer. And the approval gate has to live in your MCP server and dashboard, not in any one agent framework. Illinois law sets the outer limits. HB 1806 (P.A. 104-0054) explicitly allows AI for scheduling, billing and logistics, bans therapeutic communication and emotion detection, and fines up to **$10,000 per violation** ([ILGA HB 1806](https://ilga.gov/ftp/legislation/104/HB/10400HB1806enr.htm)). Pricing must be a flat subscription, never per lead or per referral. The hackathon demo must use synthetic data only, because Meta's Model API publishes no BAA.

**How to read the numbers.** GitHub's API and direct github.com requests were blocked while the notes were gathered. Stars, licenses and dates are snapshots read from repo pages, release pages and the npm/PyPI registries **as of Oct 25, 2026**, and stars are rounded. Every recency cell carries a tag. **[V]** means a commit or push date was verified, by shallow clone or a cached API response. **[R]** means the date is a release or registry publish date only. Where the release page showed day and month without a year, 2026 is inferred. **[U]** means recency is unverified. Some cached API dates for very active repos (Mastra, Vercel AI SDK, anthropics/skills) looked stale, so read those as "at least this recent." Check `pushed_at` yourself before you depend on any repo. Licenses outside MIT, Apache-2.0 and BSD are in **bold**. Nothing here is legal advice.

## 1. The positioning: a co-owner for practices that already exist

The earlier report framed the demo around a pre-licensed LSW. That was wrong for this product, and this report corrects it throughout. The target user holds a clinical license that allows independent practice and owns, or is about to open, a practice. In Illinois that is an LCSW, LCPC, LMFT, licensed clinical psychologist or PMHNP. The second segment is small group owners who add clinicians.

The distinction drives the whole feature set. A pre-licensed LSW in Illinois cannot even work as an independent contractor until they hold the LCSW ([NASW-IL](https://www.naswil.org/post/ask-nasw-il-now-that-i-have-my-lsw-how-do-i-get-my-lcsw)). A licensed owner faces the full stack of work: forming a PLLC, getting an IDFPR entity registration, obtaining NPIs, filling out CAQH, applying to payers, enrolling in Medicare and Medicaid, revalidating, renewing licenses, issuing Good Faith Estimates, working claims and denials, and handling quarterly taxes. Provisional's pre-licensed features (hour tracking, exam prep) are not the core of Caseload Builder. They matter only in the group-practice phase, when an owner supervises associates.

The pain is concentrated where an agent can help most. In Heard's 2026 survey of 1,950 practices (86% solo), **73.9%** said compliance and paperwork take the most time, **53.6%** named taxes as the top headache, and only **53%** paid all four estimated-tax quarters ([Heard 2026](https://www.joinheard.com/resources/the-heard-2026-financial-state-of-private-practice-report)). Psychologists who left or never joined insurance panels cited insufficient reimbursement (**82%**), administrative burden such as preauthorizations and audits (**62%**), and payment delays or refund demands (**52%**) ([APA 2024](https://apa.org/pubs/reports/practitioner/2024)).

One clinician on Reddit reports that steady-state admin drops below 30 minutes a week once credentialing is done (anecdote: [Reddit snapshot](https://reddit.sentinel-team.org/posts/1pfgo5k/snapshots/2025-12-06T08%3A01%3A09.000256Z)). That fits the pattern: the heaviest load comes at launch and in tail risk such as clawbacks. So the pitch should be "from license to full caseload, with nothing lapsing," not "save admin minutes."

Credentialing delay is the expensive part. A vendor estimate puts lost revenue at **$4,000–$8,000 per month** for a practice seeing 10 insurance clients a week ([SimplePractice](https://www.simplepractice.com/resource/hidden-costs-diy-insurance-credentialing-solo-therapists/)).

## 2. An Illinois practice runs on about 40 tasks and a dense deadline calendar

A solo Illinois practice faces roughly 40 discrete admin tasks across five phases. The biggest one-time burden is entity formation plus credentialing with each payer, which takes **60–180+ days per payer**. The biggest recurring burdens are insurance work, compliance paperwork and quarterly taxes. Four Illinois-specific traps stand out:

- **The entity must be a PLLC, not a plain LLC.** IDFPR issues deficiency notices to plain LLCs ([Illinois Lawyer Now](https://www.illinoislawyernow.com/2020/08/idfpr-cracking-down-pllc-vs-llc/)).
- **MHDDCA disclosure consents must be witnessed** ([IPA copy of 740 ILCS 110](https://illinoispsychology.org/assets/uploads/mental-health-and-developmental-disabilities-confidentiality-act.pdf)).
- **CAQH re-attestation runs every 180 days for Illinois providers**, versus 120 days elsewhere ([CAQH PO guide](https://www.caqh.org/sites/default/files/solutions/proview/guide/participating-organization-user-guide.pdf)).
- **Illinois belongs to PSYPACT only.** It is not in the Counseling Compact and has not enacted the Social Work Compact ([Emora Health](https://www.emorahealth.com/for-clinicians/licensing/illinois)).

### The five phases

**Phase 1, opening.**
- File Articles of Organization (LLC-5.5, **$150**) with a name that includes "PLLC."
- Get the IDFPR certificate of registration (**$50** for each location and each assumed name). It renews every 3 years for **$40**. For clinical psychology and social work, every member and manager must be licensed ([Nolo](https://www.nolo.com/legal-encyclopedia/form-illinois-professional-llc.html)).
- Get an EIN, a Type 1 NPI, and a Type 2 NPI for the entity. Report NPI changes to NPPES within **30 days** ([CMS NPI fact sheet](https://cms.gov/files/document/npi-fact-sheet.pdf)).
- Set up banking and malpractice insurance, a BAA-backed EHR and telehealth tool, and a baseline of HIPAA policies.
- PMHNPs also need full practice authority (4,000 clinical hours plus 250 hours of CE or training) and controlled-substance registrations ([Zivian Health, secondary](https://zivianhealth.com/collaboration-laws/illinois-np/)).

**Phase 2, credentialing.**
- Complete the CAQH profile (CAQH rebranded as **DataSpring** on June 8, 2026; logins and the attestation cycle are unchanged) ([Ensora](https://ensorahealth.com/blog/caqh-is-now-dataspring-what-it-means-for-therapists/)).
- Apply to commercial payers. BCBSIL runs an onboarding form, then a CAQH authorization, then Verisys outreach with a **30-day correction window**, recredentials every **3 years**, and verifies directory data every **90 days** ([BCBSIL](https://www.bcbsil.com/provider/network/join_bcbsil_network.html)).
- Enroll in Medicare. MFTs and MHCs have been able to enroll since Jan 1, 2024, and are paid at **75%** of the psychologist rate ([CMS](https://www.cms.gov/medicare/payment/fee-schedules/physician-fee-schedule/marriage-family-therapists-mental-health-counselors)).
- Enroll in Illinois Medicaid through IMPACT. LCSWs have been able to enroll since 2017 ([HFS notice](https://hfs.illinois.gov/medicalproviders/notices/notice.prn161228a.html)), and LCPCs and LMFTs since Dec 1, 2021 ([HFS notice](https://hfs.illinois.gov/medicalproviders/notices/notice.prn211130b.html)).

**Phase 3, recurring compliance.** License renewals, CE, the annual LLC report, estimated taxes, HIPAA tasks, the breach log and malpractice renewal. Exact dates are in the table below.

**Phase 4, per-client work.** Intake packets, eligibility checks, Good Faith Estimates, notes, superbills and records requests.

**Phase 5, group practice.**
- Worker classification under Illinois's A+B unemployment test ([overtime-flsa](https://www.overtime-flsa.com/blog/what-is-the-abc-test-for-worker-classification-in-illinois/)).
- Medicare reassignment via CMS-855I/855R, which can be effective 30 days retroactive ([First Coast](https://medicare.fcso.com/enrollment/determining-your-medicare-effective-date)).
- Payer rosters.
- Supervision of pre-licensed associates. BCBSIL requires trainee services to be billed under the supervisor's NPI and allows **at most four trainees per supervisor** ([BCBSIL notice](https://ccpa.bcbsil.com/provider/education/education-reference/news/2025/10-16-2025-reminder-on-coverage-for-services-provided)). Illinois HB1085 requires commercial coverage of supervised trainee services from **Jan 1, 2027** ([NASW-IL](https://www.naswil.org/post/summary-of-hb-1085)).

### Recurring deadlines (as of Oct 25, 2026)

In the last column, **End-to-end** means the agent can complete the task by itself. **Draft → approve** means the agent prepares everything and the clinician signs, attests or pays. **Remind only** means the step needs an identity-bound login, a legal attestation, clinical judgment or a witness.

| Obligation | Cycle / exact date | Next occurrence | Submitted to | Agent role |
|---|---|---|---|---|
| LCSW (and LSW) license | Expires Nov 30 of odd years; renewal opens in Oct; 30 CE hrs (≥3 ethics, ≥3 cultural competency, ≥1 implicit bias, ≥1 sexual harassment, Alzheimer's if applicable, 6-hr supervision course once) ([68 IAC 1470.90](https://regulations.justia.com/states/illinois/title-68/part-1470/section-1470-90/); [NASW-IL](https://www.naswil.org/post/illinois-social-worker-ceu-requirements-for-2025-2027-licensure-renewal)) | **Nov 30, 2027** | IDFPR CORE | CE gap tracking end-to-end; renewal remind only |
| LCPC (and LPC) license | Mar 31 of odd years; 30 CE hrs; LCPCs need 9 hrs of supervision training once, before their 2nd renewal ([ICA tracker](https://cdn.ymaws.com/www.ilcounseling.org/resource/resmgr/forms/2025-2027__ceu_tracker_-_fil.pdf)) | **Mar 31, 2027** | IDFPR CORE | Same |
| LMFT license | Feb 28 of odd years; 30 CE hrs ([68 IAC 1283.70](https://regulations.justia.com/states/illinois/title-68/part-1283/section-1283-70)) | **Feb 28, 2027** | IDFPR CORE | Same |
| Clinical psychologist license | Sept 30 of even years; 24 CE hrs ([68 IAC 1400.20](https://www.law.cornell.edu/regulations/illinois/Ill-Admin-Code-tit-68-SS-1400.20)) | **Sept 30, 2028** | IDFPR CORE | Same |
| APRN (PMHNP) license | May 31 of even years; 80 CE hrs; RN license renewed first ([68 IAC 1300.40](https://www.law.cornell.edu/regulations/illinois/Ill-Admin-Code-tit-68-SS-1300.40)) | **May 31, 2028** | IDFPR CORE | Same |
| IDFPR PLLC registration | Every 3 yrs on Jan 1; $40 ([ILchiro](https://ilchiro.org/?p=6137)) | Jan 1, 2028 (inferred) | IDFPR | Draft → approve |
| Illinois LLC annual report | Before the 1st day of the anniversary month; $75; $100 penalty at 60 days late; dissolution at 180 days ([LLC University](https://www.llcuniversity.com/illinois-llc/annual-report/)) | Per entity | IL Secretary of State | Draft → approve |
| CAQH (DataSpring) re-attestation | Every **180 days** in Illinois, 120 elsewhere; profile "Expired" the next day ([CAQH guide](https://www.caqh.org/sites/default/files/solutions/proview/guide/participating-organization-user-guide.pdf)) | Rolling | CAQH portal | Prep end-to-end; **attest remind only** |
| Illinois CAQH disclosure update | Re-attest with revised questions (portal changed Aug 11, 2025) ([DataSpring](https://www.dataspring.com/solutions/provider-data-management/illinois-credentialing-updates)) | One-time, if not done | CAQH | Remind only |
| BCBSIL directory verification | Every 90 days ([BCBSIL](https://www.bcbsil.com/provider/network/join_bcbsil_network.html)) | Rolling | Availity | Draft → approve |
| Payer recredentialing | 36 months (NCQA; BCBSIL 3 yrs) ([Verifiable](https://verifiable.com/blog/webinar-q-a-2025-ncqa-guideline-updates)) | Rolling | Payer / CVO | Draft → approve |
| Medicare revalidation | Every 5 yrs; due date posted on data.cms.gov up to 6 months ahead; respond within 60 days of the letter ([First Coast](https://medicare.fcso.com/enrollment/completing-revalidation-process)) | Per provider | PECOS → MAC | Polling end-to-end; **certification remind only** |
| IMPACT (Medicaid) revalidation | At least every 5 yrs; email notices at 90 and 30 days; reactivation is not retroactive ([HFS](https://hfs.illinois.gov/impact/providerrevalidation.html)) | Per provider | HFS IMPACT | Draft → approve |
| NPPES updates | Within 30 days of a change ([CMS](https://cms.gov/files/document/npi-fact-sheet.pdf)) | Event-driven | NPPES | Draft → approve |
| Federal estimated tax | Apr 15, Jun 15, Sep 15, Jan 15 ([IRS TAS](https://www.taxpayeradvocate.irs.gov/news/tax-tips/your-tax-to-do-list-important-tax-dates/2026/)) | **Jan 15, 2027** | IRS (Illinois DOR dates not verified) | Calculation end-to-end; payment approve |
| HHS breach log (<500 affected) | Within 60 days after year-end ([HHS](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html)) | ~Mar 1, 2027 | HHS OCR | Draft → approve |
| HIPAA risk analysis, training, BAA inventory | Annual best practice; HHS SRA Tool v3.7 updated Sep 18, 2026 ([HealthIT.gov](https://www.healthit.gov/topic/privacy-security-and-hipaa/security-risk-assessment-tool)) | Annual | Internal; retain 6 yrs | Draft → approve |
| Good Faith Estimate | Within 1 business day if the visit is booked ≥3 business days out; within 3 business days if booked ≥10 days out or on request; recurring services up to 12 months ([45 CFR 149.610](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-G/section-149.610)) | Per self-pay client | Client | Generate end-to-end; fee confirmation approve |
| Medicare telehealth in-person rule | In-person visit within 6 months before the first telehealth service, then every 12 months, after Dec 31, 2027 ([CMS FAQ 10/09/2026](https://www.cms.gov/files/document/telehealth-faq-updated-10-09-2026.pdf)) | Jan 1, 2028 | Per Medicare client | Tracking end-to-end |
| Mandated reporter (social workers with children) | Once every 3 cycles, per a June 2025 change ([NASW-IL](https://www.naswil.org/post/june-2025-update-to-mandated-reporter-training-with-implicit-bias-section-requirement)) | Per clinician | IDFPR | Remind only |
| Malpractice, PLLC liability, lease | Policy-specific | Annual | Carrier | Remind only |

Two patterns matter for product design.

First, Illinois has a dense cluster of deadlines in **Feb–Mar 2027**: the LMFT renewal (Feb 28), the HHS breach log (~Mar 1) and the LCPC renewal (Mar 31). That cluster makes a strong demo moment for a mixed group practice.

Second, nearly every government and credentialing step is **electronic but portal-only, behind MFA**: PECOS 2.0, NPPES, IDFPR CORE, IMPACT, the CAQH provider side and Availity. True APIs exist mainly on the payer side, through clearinghouses and CAQH's participating-organization interfaces ([MuleSoft CAQH connector](https://docs.mulesoft.com/caqh-connector/latest/)). So the realistic agent pattern is to hold a **structured "credentialing profile"**, prefill every form from it, poll the public status sources (data.cms.gov, the BCBSIL status checker), and stop before the human login, signature or attestation.

## 3. Skill-by-skill repo map: borrow structure, not code

Copyleft rules for this whole section. If you call a hosted API, AGPL does not reach your code. If you run an unmodified copy as a separate service, you generally owe nothing. If you modify AGPL code and serve it over a network, you must publish your changes. If you paste AGPL or GPL code into the repo, the copyleft follows it. If you want to keep Caseload Builder's code proprietary later, study the AGPL projects below and reimplement them.

### Referrals: NPPES discovery, a CRM-shaped pipeline and an approval-gated outreach loop

NPPES needs no key in a live test, caps results at **200 per request**, and its `taxonomy_description` matches every taxonomy a provider lists, not only the primary one ([live NPPES call](https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=Social%20Worker&city=Chicago&state=IL&limit=2); [rOpenSci docs](https://docs.ropensci.org/npi/reference/npi_search.html)). It has no email addresses, and its phone numbers are often billing lines. Pair it with practice websites or the official Google Places API, as the earlier notes recommended. Referral outreach for a licensed clinician should stay low-volume and relationship-based, and every message should be drafted, edited and approved before it sends.

| Repo / API | License | Stars | Recency | What it does | Tech stack | Borrow for therapists | Health data / HIPAA | 1-week difficulty |
|---|---|---|---|---|---|---|---|---|
| [NPPES NPI Registry API](https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=Social%20Worker&city=Chicago&state=IL&limit=2) | Public US government API | n/a | Live Oct 25, 2026 [V] | Searches providers by taxonomy, city, ZIP wildcard, name | REST/JSON | Taxonomy sweeps (Family Medicine, Pediatrics, Psychiatry & Neurology, Hematology & Oncology, OB/GYN) across `606*` ZIPs | Public provider data, not PHI | Easy |
| [marmelab/atomic-crm](https://github.com/marmelab/atomic-crm) | MIT | ~1.2k | v1.6.0, 22 Sep [R] | CRM with deals Kanban, tasks with reminders, notes, CC-email capture | React, react-admin, shadcn, Supabase | Stages Discovered → Contacted → Meeting → Referring; follow-up tasks; logging outreach | Professional contacts only, no PHI | Easy |
| [ropensci/npi](https://github.com/ropensci/npi) | MIT (shows as NOASSERTION) | 38 | push 2026-09-06 [V] | Best-documented NPPES wrapper | R | Port `npi_flatten` (one row per provider) and `npi_is_valid` (Luhn check) to TS | Public data | Easy |
| [filip-michalsky/SalesGPT](https://github.com/filip-michalsky/SalesGPT) | MIT | ~2.7k | [U] | Stage-aware sales agent with follow-ups and human-in-the-loop | Python <3.12, LangChain, LiteLLM | Stage-analyzer prompt ("what stage is this relationship in, what's next?"). **Remove the Stripe payment-link tool** | None | Medium |
| [kaymen99/sales-outreach-automation-langgraph](https://github.com/kaymen99/sales-outreach-automation-langgraph) | **License not shown; verify** | ~379 | [U] | Lead → research → score → personalized email → CRM update | Python, LangGraph | The graph shape; swap LinkedIn for NPI plus website; score by referral fit | None | Medium |
| [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) | MIT | ~6.8k | v1.18.1, 20 Sep [R] | Scrapes Google Maps listings and site emails | Go, REST jobs API | Discovery queries for schools and community orgs, prototyping only. **Its README warns of ToS risk**, so use the official Places API in production | Public business data | Easy |
| [openreferral/specification](https://github.com/openreferral/specification) (HSDS) | **CC BY-SA (spec; share-alike)** | ~130 | commit 2026-09-09 [V] | Schema for community-resource directories (211) | JSON schema | Organization → Service → Location → Contact model for cancer nonprofits and support programs | Not PHI | Easy |
| [taylorwilsdon/google_workspace_mcp](https://github.com/taylorwilsdon/google_workspace_mcp) | MIT | ~3.4k | push 2026-10-25 [V] | MCP server with 120+ tools: Gmail, Calendar, Drive, Docs, Sheets, Forms | Python, OAuth 2.1, stdio/HTTP | Send approved outreach from the clinician's own Gmail; log replies | Fine for referral-source email; no client PHI without a Google BAA | Medium |
| [twentyhq/twenty](https://github.com/twentyhq/twenty) | **AGPL-3.0 core + Enterprise files; SDK/UI MIT** | ~58.5k–59.7k | v2.37.0, 28 Aug [R]; push 2026-10-25 [V] | Modern CRM with custom objects, workflows, native MCP on cloud | TypeScript, NestJS, Postgres, Redis | "Referral Source" object; workflow-created follow-ups (ideas only) | Self-host for anything sensitive | Hard |

Also considered: [krayin/laravel-crm](https://github.com/krayin/laravel-crm) (MIT, but PHP, needs 3 GB+ of RAM and documents no API), plus [espocrm/espocrm](https://github.com/espocrm/espocrm) and [frappe/crm](https://github.com/frappe/crm), which are both **AGPL-3.0**. Skip [openreferral/hsds-transformer](https://github.com/openreferral/hsds-transformer), which is archived.

### Instagram: Meta's publishing API, Postiz as the study object, safe-messaging rules

Meta's Content Publishing API needs an Instagram **professional** account. On the "Instagram API with Instagram Login" path it uses the `instagram_business_basic` and `instagram_business_content_publish` scopes on host `graph.instagram.com`. Publishing has three steps: create a container, poll `status_code` (Meta recommends once a minute for up to 5 minutes), then publish. Meta fetches media from a **public URL**, and images must be JPEG ([Meta Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)).

Format limits:
- Carousels hold up to 20 items, with no Reels and no per-item captions.
- Images must have an aspect ratio between 4:5 and 1.91:1, so make carousel slides **1080×1350**.
- Reels are 9:16 MP4/MOV, 3 seconds to 15 minutes, 300 MB maximum.
- `alt_text` is supported on images ([Meta media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media)).

Meta's docs give both **100 and 50** as the 24-hour publishing cap, so plan for 50 ([Meta Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)).

| Repo / API | License | Stars | Recency | What it does | Tech stack | Borrow for therapists | Health data / HIPAA | 1-week difficulty |
|---|---|---|---|---|---|---|---|---|
| [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) | **AGPL-3.0** | ~36.7k–37.8k | v2.23.0, 04 Aug [R]; push 2026-10-24 [V] | Agentic social scheduler with public API and MCP; IG feed, carousel, Reels, Stories ([Postiz IG docs](https://docs.postiz.com/providers/instagram)) | Next.js, NestJS, Prisma/Postgres, Temporal | **The reference for your connector**: provider abstraction, `now`/`schedule` post type, `tags` for content pillars, upload endpoint, rate-limit config ([API docs](https://docs.postiz.com/public-api/introduction)). Study it; don't copy it | None by design; captions are the risk | Easy (study) |
| [gitroomhq/postiz-agent](https://github.com/gitroomhq/postiz-agent) | **AGPL-3.0** | ~543 | push 2026-10-22 [V] | Agent skill, CLI and hosted MCP; README lists **"Muse"** as a supported host | Node CLI, hosted MCP | How a social skill plus MCP pairing is packaged for many agent hosts | Same as Postiz | Easy |
| [langchain-ai/social-media-agent](https://github.com/langchain-ai/social-media-agent) | MIT | ~2.9k | [U] | Drafts posts, interrupts for human edit/accept/reject, then schedules | TypeScript, LangGraph, Supabase | The "clinician approves every post" state machine | None | Medium |
| [vercel/satori](https://github.com/vercel/satori) | **MPL-2.0 (file-level copyleft)** | ~13.8k | [U] | HTML/CSS → SVG | TypeScript | Branded JSX carousel slides → JPEG at 1080×1350 | None | Easy |
| [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) | MIT | ~133.8k | v1.3.9, 21 Oct [R] | Topic → script → TTS → b-roll → captioned 9:16 video; REST API | Python, ffmpeg, faster-whisper | Reel microservice; restrict stock footage to avoid distress imagery | None | Medium |
| [remotion-dev/remotion](https://github.com/remotion-dev/remotion) + [template-tiktok](https://github.com/remotion-dev/template-tiktok) | **Remotion License: free only for organizations with ≤3 employees** ([LICENSE](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)) | ~67.4k / ~278 | [U] | Programmatic React video; word-by-word captions | TypeScript/React | Branded reel templates (hook card, myth vs fact) in your own stack | None | Medium |
| [m-bain/whisperX](https://github.com/m-bain/whisperX) | BSD-2-Clause | ~24.8k | README cites a 2026 update [U] | Word-level timestamps | Python | Captions on the clinician's own talking-head reels | Never run it on client audio | Easy |
| [facebookresearch/sam3](https://github.com/facebookresearch/sam3) | **SAM License (custom)** | ~11.2k | SAM 3.1, 2026-03-27 [V] | Segment and track objects in images and video | Python/PyTorch | Background cut-out behind the clinician; scores well with Meta judges | Never run it on client imagery | Medium |
| [meta-llama/PurpleLlama](https://github.com/meta-llama/PurpleLlama) | MIT tools; **Llama Community License on models** | ~4.4k | [U] | Llama Guard classifiers; S11 covers suicide and self-harm ([model card](https://huggingface.co/meta-llama/Llama-Guard-3-8B)) | Python | Second safety check on drafts | Content classifier only | Medium |
| [fbsamples/reels_publishing_apis](https://github.com/fbsamples/reels_publishing_apis) | **Meta Platform Policy license** | 76 | [U] | Official Reels publishing sample | Mixed | Read the container → poll → publish flow; don't reuse | None | Easy (reference) |

Also considered: [inovector/mixpost](https://github.com/inovector/mixpost) (MIT, but PHP, and its API appears to be a Pro feature). [crewAIInc/crewAI-examples](https://github.com/crewAIInc/crewAI-examples) is archived with no license, so borrow only the strategist → copywriter → critic idea. No open repo implements safe-messaging rules for suicide content. Write your own rules from [SAVE's recommendations](https://www.save.org/media/media-recommendations/) and [Orygen #chatsafe](https://orygen.org.au/Training/Resources/Self-harm-and-suicide-prevention/Guidelines/chatsafe-A-young-person-s-guide-for-communicatin). Every suicide-related post should include 988 and no method details.

### Front desk: the best receptionist designs are AGPL, so rebuild their patterns

The strongest open receptionists are copyleft. Rebuild their patterns in TypeScript:

- From **DeskRoute**: offer only open slots long enough for the service, **re-check availability right before booking**, and queue questions the agent can't answer for the owner. Each answer becomes a permanent Q&A entry ([DeskRoute](https://github.com/PrabhatMattoo/DeskRoute)).
- From **AIReceptionist**: a consent preamble and a sweeper that deletes old recordings ([AIReceptionist](https://github.com/kirklandsig/AIReceptionist)).
- From **SeldonFrame**: its "quote-guard" against invented prices, rebuilt as a fee-guard ([SeldonFrame](https://github.com/seldonframe/seldonframe)).

No open repo implements mental-health screening with crisis routing. Under HB 1806 the front desk should not attempt any screening (see section 8).

| Repo / API | License | Stars | Recency | What it does | Tech stack | Borrow for therapists | Health data / HIPAA | 1-week difficulty |
|---|---|---|---|---|---|---|---|---|
| [PrabhatMattoo/DeskRoute](https://github.com/PrabhatMattoo/DeskRoute) | **AGPL-3.0 (owner/license disputed; verify)** | 9 | topic page 2026-09-18 [U] | Phone receptionist for appointment businesses | TypeScript, LiveKit Agents, Postgres/Drizzle, Hono | Re-check before booking; escalation → Q&A memory; AI disclosure at call start | No HIPAA claim | Medium (patterns) |
| [Hiberius/whatsapp-receptionist](https://github.com/Hiberius/whatsapp-receptionist) | MIT | ~15–27 | topic page 2026-10-18 [U] | Text and voice-note receptionist with booking and human handoff | Claude, Google Calendar, Supabase RLS + pgvector | Handoff: status flip, email with a deep link to the clinician, acknowledgement to the client. Same stack | No HIPAA claim | Medium |
| [kirklandsig/AIReceptionist](https://github.com/kirklandsig/AIReceptionist) | **AGPL-3.0** | ~116–146 | topic page 2026-10-08 [U] | Voice receptionist, Calendar booking, SIP transfer | Python, LiveKit, OpenAI Realtime | Consent preamble; retention sweeper; confirm before booking | Records by default | Medium |
| [seldonframe/seldonframe](https://github.com/seldonframe/seldonframe) | **AGPL-3.0** | ~63 | topic page 2026-10-09 [U] | Multi-channel front office (voice, SMS, chat, email) | Next.js 16, Drizzle | Fee-guard; booking-policy enforcement; `take_message` | No HIPAA claim | Hard (patterns) |
| [pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat) | BSD-2-Clause | ~16.8k | v1.7.0, 1 Aug [R] | Voice agents with Twilio/Telnyx serializers; Flows built in | Python; OpenAI-compatible LLM services | Cascaded STT → Muse Spark → TTS phone line (stretch goal) | BAAs depend on telephony and STT/TTS vendors | Medium |
| [livekit/agents](https://github.com/livekit/agents) | Apache-2.0 (**turn detector under the LiveKit Model License**) | ~13.0k | 1.7.1, 27 Aug [R] | Realtime voice with SIP | Python | Base layer under DeskRoute | LiveKit Cloud BAA on Scale/Enterprise only ([LiveKit](https://livekit.com/security)) | Medium |
| [livekit-examples/python-agents-examples](https://github.com/livekit-examples/python-agents-examples) | **Not shown; check LICENSE** | ~312 | Anam tutorial 2026-02-20 [V] | `medical_office_triage`, patient intake, `warm_handoff` | Python + Next.js | One field at a time → confirm → `update_field` → read back → `submit_form` ([LiveKit blog](https://livekit.com/blog/build-healthcare-intake-assistant-anam-avatar)) | Tutorial doesn't mention HIPAA | Easy–Medium |
| [dograh-hq/dograh](https://github.com/dograh-hq/dograh) | BSD-2-Clause | ~5.6k | v1.47.0, 2026-09-15 [V] | Self-hosted Vapi/Retell alternative with visual flows and MCP | BYO LLM/STT/TTS | Clinician-editable call script | Self-host; no HIPAA claim | Medium |
| [Cal.com hosted MCP](https://www.developersdigest.tech/mcp-servers/calcom) | Hosted service | n/a | n/a | 72 booking tools at `mcp.cal.com` | OAuth 2.1, Streamable HTTP | `get_availability`, `create_booking` for consults | BAA free on Enterprise / Orgs with 15+ users, else **$300/mo** ([Cal.com HIPAA](https://cal.com/compliance/hipaa)) | Easy |
| [nspady/google-calendar-mcp](https://github.com/nspady/google-calendar-mcp) | MIT | ~1.2k | push 2026-10-13 [V] | Calendar events and free/busy | TypeScript | Slot offering from the clinician's calendar | No PHI without a Google BAA | Easy |
| [calcom/cal.diy](https://github.com/calcom/cal.diy) | MIT (AGPL until Apr 2026) | ~49.4k | 2026-10-19 [V] | Self-hosted scheduling | Next.js, Prisma | Booker UI; **Workflows (reminders) removed**, so build reminders yourself ([Cal.com blog](https://cal.com/blog/cal-diy-open-source-to-closed-source)) | "Non-production" warning; no BAA | Medium |
| [Twilio](https://www.twilio.com/en-us/hipaa) | Commercial | n/a | n/a | Phone numbers, SMS, Voice, Media Streams | Webhooks | The public endpoint for calls and texts | BAA only on Security/Enterprise Edition; SMS, Voice and Media Streams are eligible ([eligible list](https://twilio.com/content/dam/twilio-com/global/en/other/hippa/pdf/HIPAA-Eligible-Services.pdf)) | Easy |

Skip [vocodedev/vocode-core](https://github.com/vocodedev/vocode-core), which is seeking maintainers. [bolna-ai/bolna](https://github.com/bolna-ai/bolna) is MIT and documents a custom LLM base URL, but it is also "looking for maintainers." Intake form builders such as [Formbricks](https://github.com/formbricks/formbricks), [OpnForm](https://github.com/JhumanJ/OpnForm) and [HeyForm](https://github.com/heyform/heyform) are all **AGPL** at the core, so build intake as native Supabase forms or FHIR questionnaires instead.

### Credentialing: public data plus deterministic form filling

No credible open-source tool automates CAQH or PECOS. CAQH's APIs serve participating organizations, not individual providers ([CAQH guide](https://www.caqh.org/sites/default/files/solutions/proview/guide/participating-organization-user-guide.pdf)). The only "PECOS API" that turned up is a third-party scraper ([Apify](https://apify.com/pink_comic/cms-pecos-medicare-provider-enrollment-screening)).

The open building blocks:
- **NPPES** for NPI checks.
- **CMS's Public Provider Enrollment Files**, which cover enrollment, reassignment and practice locations (Data Guidance v1.9, July 2026) ([CMS PPEF guide](https://data.cms.gov/sites/default/files/2026-07/PPEF_Data_Guidance.pdf)).
- **The data.cms.gov revalidation list**.
- **pdf-lib**, to fill payer PDFs from one structured profile.

The commercial APIs (Medallion, Verifiable) are customer-gated, so they can't be tried within a week.

| Repo / API | License | Stars | Recency | What it does | Tech stack | Borrow for therapists | Health data / HIPAA | 1-week difficulty |
|---|---|---|---|---|---|---|---|---|
| [CMS PPEF](https://data.cms.gov/sites/default/files/2026-07/PPEF_Data_Guidance.pdf) + data.cms.gov revalidation list ([First Coast](https://medicare.fcso.com/enrollment/completing-revalidation-process)) | Public data | n/a | Guide v1.9, Jul 2026 [R] | Medicare enrollment, reassignment and revalidation due dates | CSV/API | "Are you enrolled? When is revalidation due?" check by NPI | Provider data, not PHI | Medium (big files; pre-filter to IL) |
| [Hopding/pdf-lib](https://github.com/Hopding/pdf-lib) | MIT | ~8.6k | [U]; Documenso uses the maintained fork `@cantoo/pdf-lib` | Fill AcroForm text, checkbox, radio and dropdown fields | TS/JS | Extract field names → Muse Spark maps them to the profile JSON → fill → flatten → clinician signs | Provider PII (SSN, DOB): encrypt | Easy–Medium |
| [browserbase/stagehand](https://github.com/browserbase/stagehand) | MIT | ~25.5k | Go module v4.0.0 [U] | Browser agent with `act`, `extract`, `observe` | TypeScript, Playwright | Prefill a **mock** payer portal and stop before submit; `observe` keeps credentials away from the model | Portal ToS unverified; snapshots can capture secrets | Medium |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) | MIT | ~119.1k | [U] | Browser agent; any OpenAI-compatible `base_url` ([docs](https://docs.browser-use.com/customize/supported-models)) | Python | Same pattern; its docs warn that snapshots "may still contain secrets" | As above | Medium |
| [Skyvern-AI/skyvern](https://github.com/Skyvern-AI/skyvern) | **AGPL-3.0** | ~23.1k | [U] | Vision browser agent with 2FA support; CAPTCHA solving only in the paid cloud | Python | Ideas only | As above | Hard |
| [DSACMS/npd](https://github.com/DSACMS/npd) | CC0-1.0 | 19 | push 2026-10-01 [V] | CMS's new National Provider Directory | Python | Data model; future sync target | Public | Medium |
| [HL7-DaVinci/plan-net-ri](https://github.com/HL7-DaVinci/plan-net-ri) | Apache-2.0 | 3 | push 2026-07-23 [V] | Plan-Net FHIR directory server and crawler | Java, React | Which payer networks list which Chicago groups (panel strategy) | Public | Hard |
| [Medallion API](https://docs.medallion.co/) / [Verifiable API](https://docs.discovery.verifiable.com/) | Commercial, gated | n/a | n/a | Credentialing, payer enrollment, license monitoring with webhooks | REST | Data model and webhook events to copy into your own schema | Vendor-held | Not feasible in a week |

### Billing and claims: Stedi for the rails, deterministic rules for the logic

Stedi is the clear first choice:
- The free Sandbox plan gives mock eligibility.
- Pay-as-you-go has **no monthly minimum** and includes a **signed BAA**. Prices are $0.30 per eligibility check, $0.30 per claim and $0.20 per ERA ([Stedi pricing](https://www.stedi.com/pricing)).
- Test claims need a production account with a test key. Claims sent to payer ID `STEDI` return 277CA acknowledgments and 835 ERAs. The subscriber member-ID prefix sets the outcome: `STEDI_PAID_`, `STEDI_PARTIALLY_PAID_` or `STEDI_DENIED_` ([test claims workflow](https://stedi.com/docs/healthcare/test-claims-workflow)).
- Stedi's MCP server runs in test mode "without PHI," but only for production accounts ([test mode](https://stedi.com/docs/healthcare/test-mode)).

That is your demo denial, ready-made. The LLM explains the denial and drafts the fix. Deterministic rules decide what is allowed:
- **Hard rules** (block the claim): 90785 is an add-on and never stands alone; crisis codes 90839/90840 can't be billed with 90791, 90832–90838 or 90785; exact start and stop times must be documented, and psychotherapy under 16 minutes is not billable ([CMS A57480](https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleid=57480&bc=0); [CGS checklist](https://www.CGSMedicare.com/pdf/psychotherapy_checklist.pdf)).
- **Coding rules** (fill or check automatically): POS 10 when the client is at home and 02 elsewhere ([CMS POS](https://www.cms.gov/medicare/coding-billing/place-of-service-codes/code-sets)), plus modifier 95 for video and 93 for audio-only ([Mentalyc, secondary](https://www.mentalyc.com/blog/telehealth-place-of-service-modifiers)).
- **Watchdogs** (warn before it's too late): timely filing, such as Cigna's 90 days in network ([Cigna](https://static.cigna.com/assets/chcp/resourceLibrary/clinicalReimbursementPayment/medicalClinicalReimburseWhenToFile.html)).

| Repo / API | License | Stars | Recency | What it does | Tech stack | Borrow for therapists | Health data / HIPAA | 1-week difficulty |
|---|---|---|---|---|---|---|---|---|
| [Stedi healthcare API](https://www.stedi.com/pricing) ([GitHub org](https://github.com/Stedi): `openApi` specs, [awesome-edi](https://github.com/Stedi/awesome-edi) Apache-2.0, 144★) | Commercial API | n/a | PyPI `stedi` 1.0.0, 2026-09-08 [R]; openApi updated Aug 13, 2026 [R] | 270/271 eligibility, 837P claims, 277CA, 835 ERA, ERA PDF, webhooks, MCP | JSON REST; generate a TS client from the OpenAPI specs | Eligibility card, test claim → denied ERA → plain-English explanation | **BAA on pay-as-you-go**; test mode sends nothing to payers | Easy (eligibility) / Medium (claims + ERA) |
| [Claim.MD](https://docs.claim.md/docs/test-account-quickstart-guide) | Commercial | n/a | n/a | REST upload, status, ERA as 835/PDF/JSON, eligibility; `REJECT`/`DENY` test triggers | REST | Cheapest production fallback (~$30/mo + $0.30/transaction, per [Pabau](https://pabau.com/blog/claim-md-pricing/)) | BAA not confirmed | Medium |
| [Availity API](https://developer.availity.com/blog/2025/10/31/availity-api-guide) | Commercial | n/a | n/a | Free Demo plan with canned 270/271 and 276/277; production needs a contract | OAuth 2.0 REST | Claim-status polling pattern | BAA terms unverified | Medium (demo) / Hard (live) |
| [owgreen-dev/x12sdk](https://github.com/owgreen-dev/x12sdk) | Apache-2.0 | 1 | PyPI 2.2.0, 2026-10-22 [R] | Maintained fork of LinuxForHealth x12: 837P/835/270/271/276/277 Pydantic models | Python | Port the 835 CLP/CAS/SVC → claim/adjustment/line shape into Zod types | Offline; PHI only where X12 is sent | Medium |
| [azoner/pyx12](https://github.com/azoner/pyx12) | BSD | ~188 | PyPI 4.0.0, 2026-05-05 [R] | HIPAA X12 validator, 837 5010 maps | Python | Validation side-service if you ever emit raw X12 | Offline | Medium |
| [tastypackets/x12-parser](https://github.com/tastypackets/x12-parser) | MIT | ~62 | npm 1.3.0, 2024-09-21 [R] | Streaming X12 parser with TS typings | Node | Parse a raw 835 in Node if needed | Offline | Easy |
| [aaronhuggins/node-x12](https://github.com/aaronhuggins/node-x12) | MIT | ~55 | npm 1.7.1, 2022-04-22 [R]; "maintenance mode as of 2021" | X12 parse/generate | TypeScript | Kept despite age: the only TS X12 generator found. Reference only | Offline | Medium |
| [openemr/openemr](https://github.com/openemr/openemr) | **GPL-3.0** | ~5.5k | v8.4.1, 2026-09-20 [R]; push 2026-10-25 [V] | Full EHR with fee sheet, 837 generation, ERA posting, eligibility ([features](https://www.open-emr.org/wiki/index.php/OpenEMR_Features)) | PHP, MySQL | Billing state machine: encounter → fee sheet → claim batch → ERA posting → patient balance | Self-host | Hard (concepts only) |
| [Kustode-ce/medical-billing-mcp](https://github.com/Kustode-ce/medical-billing-mcp) | MIT | 6 | v0.1.0, ~Jun 2026 [R]; Glama marks it "Inactive" | MCP lookups for CPT, ICD, modifiers, CARC/RARC denials, payer rules | Python | Tool design: `lookup_denial`, `lookup_payer`, `lookup_bundling` | Reference data, not dependable | Easy (pattern) |
| [Stripe](https://www.npmjs.com/package/stripe) | MIT SDK | n/a | npm 23.0.1, 2026-10-22 [R] | Card payments, invoices, Checkout | TS | Self-pay collection with neutral descriptions ("Professional services, 10/21/2026") | **No BAA**; keep CPT/ICD out of metadata ([HIPAA Journal](https://www.hipaajournal.com/is-stripe-hipaa-compliant/)) | Easy |
| [bigcapitalhq/bigcapital](https://github.com/bigcapitalhq/bigcapital) | **AGPL-3.0** | ~4.0k | v0.15.43, 07 Oct [R] | Double-entry accounting with invoices and REST API | TypeScript monorepo | Ledger schema (accounts, journal entries, payment allocation) for bookkeeping | Self-host | Hard (schema only) |
| [killbill/killbill](https://github.com/killbill/killbill) | Apache-2.0 | ~5.8k | [U] | Subscription billing platform | Java | Not needed; listed as the only permissive billing engine | n/a | Hard |

Skip [frappe/books](https://github.com/frappe/books), archived 2026-10-02. Invoice Ninja and Akaunting are source-available (**Elastic License**, **BSL**), not open source. Optum's sandbox returns canned data only, and Office Ally has no self-serve API.

### Paperwork and e-signature: generate documents yourself, keep AGPL e-sign as a sidecar

All four mature open e-signature platforms are **AGPL**. For a one-week build, the cleanest path is to generate GFEs, consents, ROIs and superbills with react-pdf or pdf-lib (both MIT). Capture a drawn or typed signature with an audit row in Supabase that records the hash, timestamp and IP.

Illinois adds a twist. **MHDDCA disclosure consents must be witnessed** by someone who can attest to the client's identity. A consent without an expiration date is valid only on the day it is received, and blanket consents are invalid ([740 ILCS 110](https://illinoispsychology.org/assets/uploads/mental-health-and-developmental-disabilities-confidentiality-act.pdf)). So the ROI flow needs a witness step, which generic national e-sign templates lack.

| Repo / API | License | Stars | Recency | What it does | Tech stack | Borrow for therapists | Health data / HIPAA | 1-week difficulty |
|---|---|---|---|---|---|---|---|---|
| [diegomura/react-pdf](https://github.com/diegomura/react-pdf) | MIT | ~16.8k | [U] | React components → PDF | React, Node | GFE, superbill, consent and treatment-plan templates as components | Output contains PHI; store on BAA infrastructure | Easy |
| [CMS GFE template (CMS-10791-2)](https://www.psychiatry.org/getmedia/a49d11d8-be77-475f-a1b8-42ff96394509/CMS-10791-2-Good-Faith-Estimate-Template.pdf) + [right-to-GFE notice](https://cms.gov/files/document/appendix-1-standard-notice-right-receive-good-faith-estimate-expected-charged-under-no-surprises-act.pdf) | Public government forms | n/a | n/a | Required GFE fields and notice | PDF | The exact field set: client name and DOB, itemized services, codes, charges, NPI, TIN, location, disclaimers ([eCFR](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-G/section-149.610)) | PHI | Easy |
| [documenso/documenso](https://github.com/documenso/documenso) | **AGPL-3.0** | ~15.2k | [U] | E-signature platform | TypeScript, Prisma, Postgres, `@cantoo/pdf-lib` | Closest stack match; run unmodified as a sidecar if you need full e-sign | Self-host on BAA infrastructure | Medium |
| [docusealco/docuseal](https://github.com/docusealco/docuseal) | **AGPL-3.0 + §7 terms** | ~18.4k | [U] | E-sign with API and webhooks; embedded forms are Pro | Rails, Vue | Template and webhook model | Self-host | Medium (needs a non-Vercel host) |
| [OpenSignLabs/OpenSign](https://github.com/OpenSignLabs/OpenSign) | **AGPL-3.0** | ~7.0k | [U] | E-sign with API keys | Node, React, MongoDB | Alternative sidecar | Self-host | Medium |
| [gotenberg/gotenberg](https://github.com/gotenberg/gotenberg) | MIT | ~12.8k | v8 line [U] | HTML/DOCX → PDF, merge, flatten, PDF/A | Docker (Go) | Convert existing DOCX consent templates | Needs a container host | Easy |
| [carboneio/carbone](https://github.com/carboneio/carbone) | **Carbone Community License (not OSI)** | ~2.1k | [U] | DOCX/ODT templating | Node + LibreOffice | Template-marker idea only | n/a | Medium |
| [HL7 PHQ-9 Questionnaire](https://build.fhir.org/ig/HL7/US-Core/Questionnaire-phq-9-example.html) / [GAD-7](https://build.fhir.org/ig/paciowg/sample-data-fsh/Questionnaire-GAD7Questionnaire.html) + [lhncbc/lforms](https://github.com/lhncbc/lforms) / [aehrc/smart-forms](https://github.com/aehrc/smart-forms) | Public IG; **NLM terms** / Apache-2.0 | ~128 / ~63 | 2026-10-20 [V] / 2026-10-26 AEST [V] | Standard measure definitions and renderers | JS / React | Post-booking self-report forms the clinician reviews (not front-desk screening) | PHI | Easy |
| [Open-scribe/OpenScribe](https://github.com/Open-scribe/OpenScribe) | MIT | ~222 | [U] | AI scribe; README says "not HIPAA compliant yet" | Next.js, whisper.cpp | Out of scope for this product; notes are commoditized. Reference only | Requires written consent under HB 1806 §15(b) | Medium |

### Compliance and deadlines: one obligations table and a cron

No open-source credential-expiration tracker for clinicians exists. Build one as a single `obligations` table with fields `{type, due_at, recurrence_rule, lead_times[], owner, status, evidence_url}`, plus a nightly job that emits reminders at T-90, T-30 and T-7. Supabase pg_cron is enough for that. Trigger.dev is the upgrade for durable multi-step sequences, and its cloud became "HIPAA ready" with a BAA add-on on **Jun 9, 2026** ([Trigger.dev](https://trigger.dev/changelog/hipaa-ready)).

| Repo / API | License | Stars | Recency | What it does | Tech stack | Borrow for therapists | Health data / HIPAA | 1-week difficulty |
|---|---|---|---|---|---|---|---|---|
| Supabase pg_cron ([Supabase HIPAA](https://supabase.com/docs/guides/security/hipaa-compliance)) | Postgres extension | not fetched | [U] | Scheduled jobs in the database | SQL | Nightly deadline sweep; IG publish queue | HIPAA on hosted Supabase only, with BAA + add-on | Easy |
| [triggerdotdev/trigger.dev](https://github.com/triggerdotdev/trigger.dev) | Apache-2.0 | ~16.6k | [U] | Durable jobs, crons, waits | TypeScript | Reminder sequences; publish retries; token refresh | BAA add-on on cloud | Easy–Medium |
| [inngest/inngest](https://github.com/inngest/inngest) | **SSPL server (delayed Apache); SDKs Apache-2.0** | ~5.8k | [U] | Event-driven durable functions | TypeScript SDK | `waitForEvent` for "remind until confirmed" | BAA not found | Medium |
| [trycompai/comp](https://github.com/trycompai/comp) | **AGPL-3.0 core + commercial /ee** | ~1.9k | [U] | Compliance automation including HIPAA | Next.js, Trigger.dev, Prisma (your stack) | Policy, control and evidence data models | Reference only | Hard (embed) |
| [intuitem/ciso-assistant-community](https://github.com/intuitem/ciso-assistant-community) | **AGPL-3.0 + enterprise dir** | ~4.5k | [U] | GRC with a NIST SP 800-66 (HIPAA) framework | Django, SvelteKit | Mine its HIPAA control list | Reference | Hard |
| [getprobo/probo](https://github.com/getprobo/probo) | MIT | ~1.3k | [U] | Compliance platform with an MCP server | Go, Postgres, GraphQL | MCP-exposed compliance pattern (HIPAA unconfirmed) | Reference | Hard |
| [HHS SRA Tool v3.7](https://www.healthit.gov/topic/privacy-security-and-hipaa/security-risk-assessment-tool) | Free government tool | n/a | Updated Sep 18, 2026 [R] | Security risk assessment questionnaire | Windows app + Excel | Run its question set as a guided annual chat that writes a report | Data stays local | Easy–Medium |

### Supporting layer: frameworks, MCP and skill collections

Your repo plugs into whatever agent the clinician already runs, so the host agent handles orchestration. The framework only matters for the **hosted** pieces: the front-desk webhook, scheduled runs, and the eventual app. Every major framework now has a pause-for-approval feature, but the portable design puts approvals in your own MCP server and Supabase tables instead (section 5).

Muse Spark is reachable at `https://api.meta.ai/v1` through Chat Completions, Responses and an Anthropic-compatible Messages API. Meta calls it drop-in compatible with "OpenAI-compatible agent CLIs" ([Meta Model API docs](https://dev.meta.ai/docs/overview)). Avoid the `-contributor` models, because choosing one "lets Meta use your prompts and completions to train future models" ([promptfoo](https://www.promptfoo.dev/docs/providers/meta/)).

| Repo / API | License | Stars | Recency | What it does | Tech stack | Borrow | Health data / telemetry | 1-week difficulty |
|---|---|---|---|---|---|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | **Mixed: many Apache-2.0; document skills source-available** | ~171.6k | push ≥2026-08-21 [V, likely stale] | Agent Skills standard examples ([agentskills.io](http://agentskills.io)) | SKILL.md folders | Folder layout for your eight playbooks | Anthropic's BAA does **not** cover Skills ([Anthropic](https://support.claude.com/en/articles/8114513)) | Easy |
| [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | MIT → **Apache-2.0 for new contributions; docs CC-BY-4.0** | ~89.9k | [U] | Reference MCP servers | TS/Python | Server structure for `mcp-server/` | n/a | Easy |
| [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | Apache-2.0 (**`ee/` is enterprise**) | ~27.7k | push ≥2026-09-04 [V, likely stale] | TS agents, workflows, `requireApproval`, MCP client/server ([approval docs](https://mastra.ai/docs/agents/agent-approval)) | TypeScript | Hosted front-desk agent and scheduled runs | Use only the storage exporter | Easy |
| [vercel/ai](https://github.com/vercel/ai) | Apache-2.0 | ~26.6k | push ≥2026-09-04 [V, likely stale] | `streamText`, `ToolLoopAgent`, `toolApproval` ([docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)) | TypeScript | Lightest path for dashboard chat and the front desk | No default telemetry documented | Easy |
| [openai/openai-agents-js](https://github.com/openai/openai-agents-js) | MIT | ~3.9k | push 2026-10-23 [V] | Agents, handoffs, guardrails; `baseURL` + Chat Completions mode | TypeScript | Handoff routing | **Tracing on by default**; set `OPENAI_AGENTS_DISABLE_TRACING=1` | Easy–Medium |
| [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs) | MIT | ~3.4k | push 2026-10-25 [V] | `interrupt()` / `Command({resume})` ([docs](https://docs.langchain.com/oss/javascript/langgraph/interrupts)) | TypeScript | Edit-then-approve; side effects after the interrupt | LangSmith opt-in | Medium |
| [langchain-ai/agent-inbox](https://github.com/langchain-ai/agent-inbox) | MIT | ~1.1k | **archived**, push 2026-09-18 [V] | Approval-queue UI | React | Kept despite archive: best UX reference for your approvals inbox | n/a | Easy (reference) |
| [humanlayer/humanlayer](https://github.com/humanlayer/humanlayer) | Apache-2.0 | ~12.5k | push 2026-10-25 [V] | Human approval routing (current scope unverified) | — | Approval-routing UX | — | Medium |
| [ComposioHQ/composio](https://github.com/ComposioHQ/composio) | MIT SDK; hosted service | ~30.7k | push 2026-10-25 [V] | 1000+ hosted toolkits | TypeScript | Fast Gmail/Calendar auth for PHI-free skills | Data passes through Composio's cloud | Easy |
| [activepieces/activepieces](https://github.com/activepieces/activepieces) | MIT except **`packages/ee`** | ~25.2k | push 2026-10-25 [V] | Automation "pieces" exposed as MCP | TypeScript | Reminder automations | Self-host for PHI | Medium |
| [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) / [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | MIT | ~95.5k / ~34.7k | push 2026-09 [V] | Discovery lists | — | Finding servers and skills | — | — |

Skip [n8n](https://github.com/n8n-io/n8n) (**Sustainable Use License**, fair-code rather than open source), the archived [langgraph-supervisor-js](https://github.com/langchain-ai/langgraph-supervisor-js), and the archived [GongRzhe/Gmail-MCP-Server](https://github.com/GongRzhe/Gmail-MCP-Server). The Python frameworks (CrewAI, Agno, Pydantic AI, Google ADK, Microsoft Agent Framework) would add a second runtime, and CrewAI and Agno send telemetry by default.

### Supporting layer: practice management and EHR

No maintained, permissively licensed US therapist practice-management tool exists. The only active therapy-specific project is a German Django app with 6 stars ([dholbach/my-practice](https://github.com/dholbach/my-practice), **AGPL**). That confirms Caseload Builder should **sit beside** the clinician's EHR, not replace it.

| Repo | License | Stars | Recency | What it does | Tech stack | Reusable parts | HIPAA | 1-week difficulty |
|---|---|---|---|---|---|---|---|---|
| [medplum/medplum](https://github.com/medplum/medplum) | Apache-2.0 | ~2.7k | 2026-10-25 [V] | FHIR platform, Bots, React libraries | TypeScript, Postgres, Redis | `QuestionnaireForm`, `@medplum/react-scheduling`, the patient-intake demo | Hosted BAA only on Enterprise ([pricing](https://www.medplum.com/pricing)) | Medium |
| [medplum/foomedical](https://github.com/medplum/foomedical) | Apache-2.0 | ~85 | 2026-10-24 [V] | Patient portal sample | React, Mantine | Portal shell for intake packets | As Medplum | Easy |
| [masslight/ottehr](https://github.com/masslight/ottehr) | MIT | ~335 | 2026-10-21 [V] | Intake portal + EHR on Oystehr | TypeScript, React | Check-in and paperwork UX | Oystehr signs BAAs; sandbox forbids PHI ([Oystehr](https://docs.oystehr.com/oystehr/security-and-compliance/hipaa/)) | Hard |
| [openemr/openemr](https://github.com/openemr/openemr) | **GPL-3.0** | ~5.5k | 2026-10-25 [V] | ONC-certified EHR/PM with REST and FHIR | PHP | Integrate via API only (roadmap) | Self-host | Hard |
| [alextselegidis/easyappointments](https://github.com/alextselegidis/easyappointments) | **GPL-3.0** | ~4.3k | 2026-10-19 [V] | Booking with REST and webhooks | PHP | Booking sidecar (plain GPL isn't triggered by network calls) | Self-host | Medium |

Skip [HospitalRun](https://github.com/HospitalRun/hospitalrun-frontend), archived since Jan 2023. SimplePractice and TherapyNotes publish no open APIs in these notes, so treat EHR sync as roadmap. Commercial AI receptionists such as Frontdesk already advertise EHR sync, which shows clinicians expect it eventually ([Frontdesk](https://www.myaifrontdesk.com/therapy/reports/best-ai-for-mental-health-practices-2026)).

## 4. Incumbents each own one silo and leave the business unowned

The market is split. **EHRs** charge monthly and run the clinical record and claims plumbing. **Networks** take a cut or a membership fee in exchange for credentialing and billing under their own contracts. **Scribes** sell notes. **Voice-agent companies** sell to high-volume medical specialties. **Directories** sell visibility. A quote from Assort Health's funding coverage captures the gap: "Everyone else automates one piece and forgets the rest" ([Fierce Healthcare](https://www.fiercehealthcare.com/ai-and-machine-learning/assort-health-scores-120m-series-c-scale-voice-ai-agent-platform-healthcare)).

| Category | Players and pricing | What they cover | What stays manual for an independent owner |
|---|---|---|---|
| EHR / practice management | SimplePractice $39–99/mo; Care Aide AI $29.50/mo ([Dupple](https://dupple.com/reviews/simplepractice); [launch](https://www.businesswire.com/news/home/20260617564693/en/SimplePractice-Launches-AI-powered-Care-Aide-to-Reduce-Administrative-Burden-and-Support-Clinical-Workflows)). TherapyNotes $69–79/mo plus ~$0.14 per claim; Jane $15–99; TheraBill $29–119 ([CostBench](https://costbench.com/software/mental-health-practice-management/therapynotes/)) | Scheduling, notes, claims, reminders, AI notes and treatment planning ("a tool, not a decision-maker") | Acquisition, credentialing, CAQH/license/revalidation calendar, denial strategy, business setup |
| Insurance networks | Alma $95–125/mo, credentials under **Alma's tax ID** ([ChoosingTherapy](https://www.choosingtherapy.com/alma-for-therapists-review/)). Headway: no fee, undisclosed take rate, $2.3B valuation ([Sacra](https://sacra.com/c/headway/)). Grow: free, undisclosed share, $80–120/session estimates. Rula: $70–90 per clinical hour. SonderMind: free, 2% instant payout ([ChoosingTherapy](https://www.choosingtherapy.com/?p=105117)) | Credentialing, contracting, billing, some directory exposure | Independent credentialing under the clinician's own NPI/TIN, cash-pay and OON work, the front-door phone line ([AInora](https://ainora.lt/blog/grow-therapy-ai-review-alternatives-2026)), audit and clawback exposure ([Headway](https://headway.co/resources/what-is-a-clawback)) |
| Credentialing services | DIY outsourcing $150–300 per payer or $500–1,500 per package ([SimplePractice](https://www.simplepractice.com/resource/hidden-costs-diy-insurance-credentialing-solo-therapists/)). Klarity: $50 deposit per panel + 3.9% of paid claims, 24-month term ([ChoosingTherapy](https://www.choosingtherapy.com/best-credentialing-service/)). Medallion is enterprise-only ([Kaizen](https://www.kaizenautomation.com/blog/medallion-credentialing-reviews)). Assured raised $19M for AI credentialing aimed at organizations ([Fierce](https://www.fiercehealthcare.com/finance/startup-assured-banks-19m-series-ai-native-credientialing-provider-enrollment)) | Applications, CAQH, follow-up | Solo owners priced out of enterprise tools; percentage-of-claims pricing on top of everything else |
| AI scribes | Mentalyc $19.99–69.99, Upheal free–$69, Blueprint from $29, Freed $99, Quill $20 ([Supanote](https://supanote.ai/blog/best-ai-tools-for-mental-health-professionals)). Eleos targets community behavioral health ([STAT](https://www.statnews.com/2025/01/22/eleos-behavioral-health-tech-clinical-documentation-startup-fundraise/)) | Notes | Everything else. **Notes are commoditized: don't compete there** |
| AI front desk | Assort ($120M Series C, $1.2B valuation; ortho, cardiology). Hello Patient ($22.5M; urgent care) ([Fierce](https://www.fiercehealthcare.com/health-tech/hello-patient-secures-225m-investors-bet-ai-voice-agent-growth)). Therapist-focused Frontdesk and AInora don't publish prices | Booking, intake, eligibility | Low-volume, high-stakes therapy inquiries; Illinois-compliant logistics-only scripts |
| Directories and websites | Psychology Today $29.95/mo; GoodTherapy $30.95–49.95; Zencare $59–69 + $80 setup ([Mentalyc](https://www.mentalyc.com/blog/best-therapist-directories)). Brighter Vision ~$69–149 ([ChoosingTherapy](https://www.choosingtherapy.com/best-website-builder-for-therapists/)) | Passive discovery | Referral relationships, social content, inquiry follow-up |
| Bookkeeping | Heard $129–169/mo ([ChoosingTherapy](https://www.choosingtherapy.com/best-credentialing-service/)) | Books and taxes | Quarterly-tax reminders tied to practice cash flow |

From these prices, a lean solo stack costs about **$140–165/mo** and a full stack about **$610/mo** before credentialing. That is arithmetic from the cited prices, not survey data.

The bigger economic cost is empty slots during the 2–6 month credentialing ramp. Networks also have a structural reason **not** to help clinicians build independently credentialed or cash-pay caseloads, because that business leaves their platform. That leaves room for a neutral co-owner that sits above the silos. Its moat is the unified practice state (deadlines, panels, pipeline, claims) plus a guidance layer. The risk is that SimplePractice, with 250,000+ practitioners, bolts on a growth agent. Speed and a niche such as oncology and serious illness are the near-term defenses.

## 5. Recommended repo architecture and the Instagram connector

### Evaluation of the chosen architecture

The decision to ship a portable repo of skills plus MCP is sound. It matches how clinicians already use AI: **mostly for email, content and marketing** ([APA 2025](https://www.apa.org/pubs/reports/practitioner/2025/ai-practice-management.html)). It also avoids hosting PHI for the PHI-free skills. Five adjustments make it work.

**The approval gate must live in the MCP server, not the host agent.** Claude Code, Codex, Gemini CLI and Muse Code each prompt for approval differently, and a host might be configured to auto-approve tools. So every side-effecting MCP tool (`send_email`, `schedule_post`, `book_consult`, `submit_claim`) should only *write a pending row* to an `approvals` table and return "queued for clinician approval." An executor runs the action only after the clinician clicks Approve in the localhost dashboard. That makes the guarantee agent-agnostic and gives you an audit log. It also mirrors Mastra's and LangGraph's pause-then-resume design ([Mastra](https://mastra.ai/docs/agents/agent-approval); [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/interrupts)).

**The PHI split is stricter than it first looks.** Consumer ChatGPT plans are excluded from OpenAI's BAA ([OpenAI BAA guide](https://cdn.openai.com/osa/baa-hipaa-guide.pdf)). The Gemini Developer API is not on Google's covered list ([Google Cloud HIPAA](https://docs.cloud.google.com/security/compliance/hipaa)). Meta's Model API documents no BAA ([Llama data commitments](https://llama.developer.meta.com/docs/trust/data-commitments/)). Even Anthropic's commercial BAA **excludes Skills, MCP connectors, Batch and Code Execution** ([Anthropic](https://support.claude.com/en/articles/8114513)). So PHI-touching skills cannot run through any consumer agent's skills or MCP layer. In production they need a separately deployed service: the front desk and billing on a BAA-covered model API, Supabase with the HIPAA add-on, Vercel Pro with the BAA add-on, and Twilio Security Edition. The local repo's role for those skills is limited to configuration and approvals, with no PHI passing through the host agent.

**The localhost dashboard holds PHI once billing is live.** Any client data on the clinician's laptop falls under the HIPAA Security Rule, so require full-disk encryption and keep PHI in the hosted BAA database. The local dashboard should show only IDs and summaries.

**Skills portability is partly unverified.** The Agent Skills format is an open standard ([agentskills.io](http://agentskills.io)), and Postiz's agent skill lists "Muse" among its supported hosts ([postiz-agent](https://github.com/gitroomhq/postiz-agent)). Whether Codex, Gemini CLI and Muse Code all load `SKILL.md` folders natively was not verified. MCP is the portable floor. Ship an `AGENTS.md` that points every host to `skills/` as a fallback.

**Test Muse Spark tool calling on day 1.** Meta's example shows tool calls on the Responses API ([Meta blog](https://dev.meta.ai/resources/blog/build-with-muse-spark)), and promptfoo's Meta client rejects `stream` and `stop` parameters ([promptfoo](https://www.promptfoo.dev/docs/providers/meta/)).

### Folder structure

```
caseload-builder/
├── AGENTS.md                  # host-agnostic entry: what the co-owner is, where skills live, PHI rules
├── CLAUDE.md                  # thin pointer to AGENTS.md (also used by other hosts' equivalents)
├── skills/
│   ├── referrals/SKILL.md     # NPPES sweep → score → draft → approval → follow-up; references/ethics.md
│   ├── instagram/SKILL.md     # pillar calendar → draft → critic (safe-messaging, license line) → schedule_post
│   ├── front-desk/SKILL.md    # config + scripts only; runtime is the hosted service (PHI)
│   ├── credentialing/SKILL.md # profile → payer packets → CAQH prep → status polling; never attests
│   ├── billing/SKILL.md       # eligibility → scrub → claim → ERA → denial explainer; GFE/superbill (PHI)
│   ├── compliance-calendar/SKILL.md  # obligations table, IL rule pack, CE gap analysis
│   ├── paperwork/SKILL.md     # consents, MHDDCA ROI with witness, intake packet, business docs
│   └── how-do-i/SKILL.md      # guidance layer; references/illinois/*.md (PLLC, NPI, CAQH, PECOS, IMPACT…)
├── mcp-server/                # TypeScript, stdio + Streamable HTTP
│   └── src/tools/ nppes.ts, cms-enrollment.ts, obligations.ts, approvals.ts, pdf-fill.ts,
│                  gfe.ts, stedi.ts, claim-scrubber.ts, carc-explainer.ts, instagram-proxy.ts
├── connectors/
│   ├── instagram/             # Next.js on Vercel + Supabase: OAuth callback, token vault, cron publisher, remote MCP
│   └── front-desk/            # Twilio SMS/voice webhooks, web chat, booking, crisis script (hosted, BAA tier)
├── dashboard/                 # Next.js on localhost:3000: approvals inbox, deadlines, referrals Kanban, posts, credentialing, claims
├── db/supabase/migrations/    # referral_sources, posts, obligations, credentialing_profile, payer_applications,
│                              # approvals, audit_log, inquiries, claims (PHI tables only in the HIPAA project)
├── data/                      # il-deadlines.json, cpt-rules.json (codes + own labels, no AMA text), carc.json, synthetic clinician
├── evals/                     # crisis-phrase tests, fee-guard tests, marketing-ethics critic tests, HB 1806 transcript checks
└── docs/
    ├── setup/ muse-code.md, claude-code.md, codex.md, gemini-cli.md
    ├── instagram-meta-app.md   # dev mode, testers, business verification, app review checklist
    ├── phi-boundary.md         # which skills may touch PHI, required BAAs per vendor
    └── illinois-legal-notes.md # HB 1806, MHDDCA, 740 ILCS 92, PLLC (not legal advice)
```

### Instagram connector design (your own Metricool-style service)

The connector is **one Meta app** using **Instagram API with Instagram Login**. It requests `instagram_business_basic` and `instagram_business_content_publish` and calls `graph.instagram.com` ([Meta Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)).

**Components:**
- **OAuth callback.** A Vercel route exchanges the authorization code for a token.
- **Token store.** Each clinician's token is stored encrypted in Supabase, with the key held outside the table.
- **Long-lived token refresh.** A job refreshes the 60-day token before it expires. The exact refresh endpoint and window come from general knowledge and were not verified in these notes, so check Meta's docs.
- **Public media bucket.** A Supabase Storage bucket, because Meta cURLs media from a public URL. Use unguessable paths and delete each file after it publishes.
- **Publisher.** A pg_cron or Vercel Cron job claims due posts and runs create container → poll `status_code` once a minute for up to 5 minutes → `media_publish`. It records each outcome and respects a **50-per-24-hour** cap, checkable via `content_publishing_limit` ([Meta](https://developers.facebook.com/docs/instagram-platform/content-publishing)).
- **Remote MCP server** exposing `create_post` (always creates a draft), `schedule_post` (queues an approval), `list_scheduled` and `get_insights`. It uses Streamable HTTP with OAuth 2.1, the same pattern as Cal.com's hosted MCP ([listing](https://www.developersdigest.tech/mcp-servers/calcom)).

**What to borrow from Postiz.** Study it for the provider abstraction, the now/schedule semantics, `tags` for content pillars, the upload endpoint and the configurable rate limit ([Postiz API](https://docs.postiz.com/public-api/introduction)). Don't copy its AGPL code.

**Scope.** The connector posts only. It does not read DMs or comments. That keeps it PHI-free and avoids the vulnerable-solicitation risk under NASW 4.07(a) ([NASW](https://www.socialworkers.org/About/Ethics/Code-of-Ethics/Code-of-Ethics-English/Social-Workers-Ethical-Responsibilities-as-Professionals)).

**Meta review path.** During the hackathon the app stays in development mode, and only accounts added as developers or testers can publish. Going public requires **business verification** and **App Review** for the advanced publishing permission, the same gate Postiz's self-hosters face ([Postiz IG docs](https://docs.postiz.com/providers/instagram)). Prepare these for review:
- a screencast of the full OAuth → draft → approve → publish flow
- a privacy policy and data-deletion endpoint
- an explanation that the app publishes only the clinician's own educational content

Those review requirements come from general knowledge of Meta's process and were not verified in these notes.

**Fallbacks.** Until review clears, Postiz Cloud (whose own Meta app holds the permissions) or Metricool's MCP can publish for real users. Metricool exposes `createScheduledPostForReview` and `sendScheduledPostForReview`, the same draft-then-review pattern, though that was observed only in this session's tool list.

**Content rules** (enforced by a critic step and `evals/`):
- No client stories, composites or testimonial requests (APA 5.05, NASW 4.07(b), ACA C.3.b) ([APA](https://www.apa.org/ethics/code)).
- Accurate credentials auto-inserted (NASW 4.06(c)).
- 988 and no method details on any suicide-related post.
- No outcome guarantees.
- Meta's AI-generated label set on AI imagery ([media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media)).

## 6. Three starting points carry the most weight

**1. The Agent Skills format plus the MCP reference servers** ([anthropics/skills](https://github.com/anthropics/skills); [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)). This is the skeleton of the product. Eight SKILL.md playbooks plus one TypeScript MCP server is the entire portability promise. Getting the folder conventions and server structure right on day 1 decides whether the Claude Code portability clip works. Note the mixed licensing: many example skills are Apache-2.0, but the document skills are source-available. Copy the structure, not the content.

**2. The Stedi healthcare API** ([pricing](https://www.stedi.com/pricing); [test claims](https://stedi.com/docs/healthcare/test-claims-workflow)). This is the only billing rail that gives a solo developer all of these at once:
- free mock eligibility
- free test 837P claims, with ERAs that return paid, partial or **denied** on command
- an MCP server
- public OpenAPI specs for a TS client
- a signed BAA with no monthly minimum

It turns "billing autopilot" from a slide into a live demo and is also a credible production path. Open a production pay-as-you-go account on day 1 to unlock test claims.

**3. The NPPES NPI Registry plus CMS public enrollment data** ([NPPES](https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=Social%20Worker&city=Chicago&state=IL&limit=2); [PPEF](https://data.cms.gov/sites/default/files/2026-07/PPEF_Data_Guidance.pdf)). One keyless public data layer powers both halves of the pitch. On the acquisition side it finds referral sources. On the admin side it verifies the clinician's own NPI and taxonomies, confirms Medicare enrollment and reassignment, and surfaces revalidation dates. Pair it with Atomic CRM's pipeline schema ([repo](https://github.com/marmelab/atomic-crm)) for the referrals board.

Runners-up are Postiz for connector design, Mastra or the AI SDK for the hosted front desk, and react-pdf plus pdf-lib for paperwork.

## 7. Build the week around approvals, then let the demo show restraint

The hackathon runs **Mon Oct 26 to Wed Nov 4, 2026**. The plan below fits the core into seven working days and leaves Nov 2–4 as buffer for polish and submission.

**Day 1 (Oct 26): skeleton and model check.**
- Scaffold the repo tree from section 5.
- Confirm Muse Spark tool calling and streaming through the Chat Completions and Responses APIs from a TS client, using `muse-spark-1.3` and never a contributor model.
- Create the Supabase tables: `approvals`, `audit_log`, `obligations`, `referral_sources`, `posts`, `credentialing_profile`, `payer_applications` and `claims`.
- Build the MCP server's `approvals.queue` and the dashboard's Inbox (approve, edit-then-approve, decline).
- Create the Meta app and the Stedi production account.

**Day 2 (Oct 27): compliance calendar and the guidance layer.**
- Load `data/il-deadlines.json` from section 2's table.
- Build the nightly reminder sweep.
- Add CE gap analysis for an LCPC.
- Write the CAQH/DataSpring 180-day rule.
- Poll data.cms.gov for Medicare revalidation.
- Write the first `how-do-i` reference pages (PLLC + IDFPR registration, NPI Type 1 vs Type 2, CAQH, PECOS, IMPACT).

**Day 3 (Oct 28): referrals.**
- Build the NPPES taxonomy sweep across `606*` ZIPs, plus flatten and Luhn validation.
- Score fit by shared population and distance.
- Build the Kanban board in the dashboard.
- Draft outreach as an educational introduction offering a 15-minute call, then create a 7-day follow-up task. Send through Gmail only after approval.

**Day 4 (Oct 29): Instagram connector.**
- Build the OAuth callback, encrypted tokens, public media bucket, cron publisher and remote MCP tools.
- Add the pillar planner (psychoeducation, myth vs fact, what therapy is like, clinician intro, logistics).
- Render Satori carousels at 1080×1350.
- Add the critic, with Llama Guard S11 as a second check.
- Publish to a tester account.

**Day 5 (Oct 30): credentialing and paperwork.**
- Build the structured profile and pdf-lib filling of one real payer PDF.
- Add a CAQH prep checklist that ends on "Clinician must attest."
- Build the GFE generator from the CMS field set with business-day timing.
- Add the superbill.
- Add the MHDDCA ROI with expiration and witness fields.

**Day 6 (Oct 31): billing.**
- Run a Stedi mock eligibility check.
- Build a deterministic claim scrubber covering 90785, crisis-code conflicts, POS/modifier and timely filing.
- Submit a test 837P to `STEDI` with a `STEDI_DENIED_` member ID.
- Fetch the 835 and map CARC/RARC codes to plain-English next steps from [X12's CARC list](https://x12.org/codes/claim-adjustment-reason-codes).

**Day 7 (Nov 1): front desk.**
- Build a hosted Twilio SMS webhook and web chat (local tunnel for the demo) that collects logistics fields one at a time with a read-back, in the LiveKit style.
- Add the fee-guard and the DeskRoute-style escalation that turns answers into Q&A entries.
- Book through Cal.com MCP or Google free/busy, re-checking availability before booking.
- Hard-code the crisis script.
- Add an AI disclosure on first contact.

**Nov 2–4: buffer.**
- Run the evals: crisis phrases, attempts to draw out therapeutic content, fee hallucination.
- Record the Claude Code portability clip, write the README and the per-host setup docs, rehearse, and submit.

### Demo script (about 5 minutes; all data synthetic)

**0:00, the clinician.** "Meet Dana Reyes, LCPC. She left a Chicago group practice last month and opened Reyes Counseling PLLC in Lincoln Park. She's licensed, credentialed nowhere yet, and has six clients. She already pays for an AI agent. Caseload Builder is a GitHub repo she cloned into it."

**0:20, the morning brief (Muse Code / Muse Spark).** Dana types "What needs me this week?" The co-owner reads the obligations table and replies:
- Her **CAQH/DataSpring re-attestation is due in 12 days** (Illinois 180-day cycle).
- Her **LCPC license expires Mar 31, 2027**, and she is **6 CE hours short**, including implicit bias.
- The **LLC annual report is due before her anniversary month**.
- Her **Jan 15 estimated tax** payment is coming.

Each item links to a `how-do-i` page. On camera, the CAQH item is clearly labeled: "I've prepared your updated malpractice face sheet and checklist. You must log in and click Attest yourself."

**1:10, referrals.** "Find me oncology and primary-care referral sources within 3 miles." Live NPPES results fill the Discovered column. Three outreach drafts land in the Inbox. Dana edits one line and approves it, and it sends from her Gmail. A follow-up task appears for day 7.

**2:00, Instagram.** The planner proposes a week of posts. One draft says "a client of mine told me…" The critic blocks it and rewrites it as general psychoeducation with her license line, plus 988 because the topic touches hopelessness. Dana approves, and the post publishes to her tester Instagram account through the connector's `schedule_post` tool. Cut to the phone showing the live post.

**2:50, front desk.** A synthetic prospect texts: "Do you take BCBS PPO and have evenings?" The agent answers only from approved Q&A, offers two re-checked slots, books a free consult and sends the intake packet link. A second synthetic texter writes a phrase that matches the crisis list. The agent sends the fixed 988/911 message once, stops the conversation, and pages Dana. On screen: "No empathy responses, no assessment, by design (Illinois HB 1806)."

**3:40, billing.** In the hosted billing service, Stedi mock eligibility returns a copay. A test claim to `STEDI` comes back as a **denied** 835. The co-owner translates the CARC code into plain English, shows which scrubber rule would have caught it, and drafts a corrected claim for approval. Dana has a self-pay client booking for next week, so a **Good Faith Estimate** is generated within the 1-business-day window and queued for her fee confirmation.

**4:30, portability and honesty.** A 15-second clip shows the same repo answering "What needs me this week?" in Claude Code. The closing slide reads: "Synthetic data only. PHI skills run only on BAA-covered infrastructure. The agent never signs, attests or gives therapy. Flat subscription, never per referral."

## 8. Legal limits shape the product more than the code does (not legal advice)

**Illinois HB 1806 / Public Act 104-0054** (signed Aug 4, 2025, effective immediately) defines what the agent may and may not do ([ILGA enrolled text](https://ilga.gov/ftp/legislation/104/HB/10400HB1806enr.htm); [Baker Botts](https://ourtake.bakerbotts.com/post/102lr2p/illinois-enacts-first-in-the-nation-guardrails-on-ai-therapy)).

What it allows:
- "Administrative support" explicitly includes managing scheduling and reminders, processing billing and insurance claims, and "drafting general communications related to therapy logistics that do not include therapeutic advice."
- "Supplementary support" includes record-keeping and "identifying and organizing external resources or referrals."

What it bans:
- AI that makes independent therapeutic decisions.
- AI that engages clients in "therapeutic communication," defined to include "offering emotional support, reassurance, or empathy in response to psychological or emotional distress."
- AI that generates unreviewed treatment plans.
- AI that detects "emotions or mental states."

The licensed professional must keep "full responsibility for all interactions, outputs, and data use." Fines run up to **$10,000 per violation**, and IDFPR investigates. If AI is used while sessions are recorded or transcribed, the client needs written notice and explicit, revocable consent (§15(b)).

Design implications for the front desk:
1. Only logistics: hours, fees, insurance accepted, scheduling, paperwork.
2. No empathetic phrasing at all. Use a neutral template such as "Thanks, Dana will follow up."
3. No sentiment, urgency or "fit" scoring of inquiries. That risks counting as emotion detection.
4. Crisis handling is a deterministic keyword trigger that sends a fixed 988/911 message and pages the clinician, with no assessment. Have counsel confirm that a keyword trigger is not "detecting mental states."
5. Clinician approval before anything client-facing that is not a template.
6. AI disclosure on first contact.

The Act's definition contains a tension: administrative tasks "do not involve communication," yet the examples include drafting logistics messages. Read it as excluding *therapeutic* communication, and get counsel to confirm.

**The agent never signs or attests.** Medicare requires "all individual practitioners" to e-sign their own certification statements ([CMS e-signature guide](https://CMS.gov/files/document/e-signature-how-guide.pdf)). In CAQH, only the provider logs in and clicks Attest ([BCBSIL QuickRef](https://www.bcbsil.com/docs/provider/il/network/credentialing/PR-QuickRef.pdf)). Browser agents should prefill and stop. Unverified payer-portal terms, CAPTCHAs and MFA make unattended submission both fragile and risky anyway.

**HIPAA and BAAs, by vendor.** A clinician is a covered entity once they transmit standard electronic transactions, such as electronic claims ([HHS](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html)). That makes Caseload Builder's hosted PHI services a business associate.

| Vendor | BAA? | Conditions | Source |
|---|---|---|---|
| Meta Model API (Muse Spark) | **None found** | Data commitments page is silent; Meta recommends self-hosting Llama for regulated data | [Meta](https://llama.developer.meta.com/docs/trust/data-commitments/); [Meta self-hosting](https://dev.meta.ai/llama/docs/deployment/regulated-industry-self-hosting) |
| Anthropic API | Yes (commercial) | 30-day retention; excludes Skills, MCP connectors, Batch, Code Execution | [Anthropic](https://support.claude.com/en/articles/8114513) |
| OpenAI API | Yes | HIPAA endpoints only; ChatGPT Free/Plus/Pro/Business excluded | [OpenAI](https://cdn.openai.com/osa/baa-hipaa-guide.pdf) |
| Google Cloud | Yes | Listed services only; Gemini Developer API not listed | [Google](https://docs.cloud.google.com/security/compliance/hipaa) |
| Supabase | Yes | Hosted only, BAA + HIPAA add-on | [Supabase](https://supabase.com/docs/guides/security/hipaa-compliance) |
| Vercel | Yes | Pro add-on (since Sep 2025) | [Vercel](https://vercel.com/changelog/hipaa-baas-are-now-available-to-pro-teams) |
| Twilio | Yes | Security/Enterprise Edition; eligible products only | [Twilio](https://www.twilio.com/en-us/hipaa) |
| Stedi | Yes | Pay-as-you-go plan | [Stedi](https://www.stedi.com/pricing) |
| Cal.com | Yes | Free on Enterprise / Orgs with 15+ users, else $300/mo | [Cal.com](https://cal.com/compliance/hipaa) |
| Trigger.dev | Yes | Paid HIPAA add-on | [Trigger.dev](https://trigger.dev/changelog/hipaa-ready) |
| **Stripe** | **No** | Payment-processing exemption only; keep diagnosis and CPT out of all fields | [HIPAA Journal](https://www.hipaajournal.com/is-stripe-hipaa-compliant/); [Paubox](https://paubox.com/blog/stripe-hipaa-compliant/) |

**MHDDCA (740 ILCS 110) consent requirements.** A disclosure consent must:
- name the recipient
- state the purpose and the nature of the information
- describe the right to inspect and copy, and the consequences of refusing
- carry an **expiration date** and the right to revoke
- be signed and **witnessed** by someone who can attest to the client's identity

Revocations must also be written and witnessed. Blanket consents are void. Disclosures for third-party payment need a written penalty warning (§11). Penalties include a Class A misdemeanor plus civil damages ([IPA copy](https://illinoispsychology.org/assets/uploads/mental-health-and-developmental-disabilities-confidentiality-act.pdf)). By inference, this state law applies to Illinois therapists whether or not HIPAA covers them, so even a cash-only practice needs the compliant ROI flow.

**Referral payments, and why pricing must be flat.** 740 ILCS 92/5(a) makes it unlawful to pay "any remuneration directly or indirectly... to induce any person to procure clients or patients" for insurance-billed services. Penalties run $5,000–$10,000 plus up to 3x each claim ([740 ILCS 92/5](https://ilga.gov/legislation/ilcs/documents/074000920K5.htm)). The Social Work Act disciplines fees for services "not actually rendered" ([225 ILCS 20/19](https://ilga.gov/legislation/ilcs/documents/022500200K19.htm)). NASW 1.16(c) and ACA A.10.b ban paying for referrals ([NASW](https://www.socialworkers.org/About/Ethics/Code-of-Ethics/Code-of-Ethics-English/Social-Workers-Ethical-Responsibilities-to-Clients); [ACA](https://www.counseling.org/docs/default-source/default-document-library/ethics/2014-aca-code-of-ethics.pdf)), and the federal Anti-Kickback Statute applies to Medicare and Medicaid ([HHS-OIG](https://oig.hhs.gov/compliance/physician-education/fraud-abuse-laws/)). So:
- Charge a **flat subscription**.
- Never charge per lead, per referral, per booked client or as a percentage of collections.
- No gifts to referral sources.
- No client-referral reward programs.

**Marketing ethics.**
- No soliciting testimonials from current clients or other vulnerable people (NASW 4.07(b), ACA C.3.b, APA 5.05).
- No uninvited solicitation of vulnerable people (NASW 4.07(a)), so the connector reads no DMs and sends no cold DMs.
- Accurate credentials and no outcome guarantees (NASW 4.06(c)) ([NASW](https://www.socialworkers.org/About/Ethics/Code-of-Ethics/Code-of-Ethics-English/Social-Workers-Ethical-Responsibilities-as-Professionals)).
- Only LCSWs may hold themselves out as clinical social workers ([225 ILCS 20/10](https://ilga.gov/legislation/ilcs/documents/022500200K10.htm)).

**The PLLC requirement, and the "co-owner" label.** Licensed professionals must form a PLLC, and for social work and clinical psychology every member and manager must be licensed ([Nolo](https://www.nolo.com/legal-encyclopedia/form-illinois-professional-llc.html)). The software therefore cannot literally be an owner, and the company behind it must not take equity, profit share or a revenue cut from the practice. Combined with the referral and fee-splitting rules, that is a reason to keep "co-owner" as a marketing metaphor and say so in the terms of service.

## 9. The open gaps are where Caseload Builder stands out

Six needs have no strong open-source or commercial answer for a solo or small-group owner.

**Credentialing and paneling for one clinician under their own NPI and TIN.** Medallion, Verifiable and Assured target organizations. Networks credential under their own tax IDs. No open-source CAQH, PECOS or IMPACT tracker exists. A structured credentialing profile that fills any payer PDF, tracks each payer's application, polls public status sources and prepares re-attestation would be new.

**A cross-tool compliance calendar with Illinois rules built in.** Nothing combines license expirations by profession, CE category gaps, the CAQH 180-day cycle, recredentialing, Medicare and IMPACT revalidation, the PLLC registration, the annual LLC report, estimated taxes and HIPAA tasks. That is about a day of engineering, and the rule pack is the moat.

**A guidance layer for owners without business training.** For the 43% who never had business training, step-by-step Illinois playbooks tied to the clinician's own state and deadlines don't exist in any tool. Today they live in blog posts and association member areas.

**Logistics-only front-desk scripts that comply with HB 1806.** Therapist AI receptionists market BAAs and EHR sync ([Frontdesk](https://www.myaifrontdesk.com/therapy/reports/best-ai-for-mental-health-practices-2026)). None advertises a design built around Illinois's ban on therapeutic communication and emotion detection.

**Safe-messaging and ethics checks for clinician marketing.** No open repo implements suicide safe-messaging rules, testimonial bans or credential-accuracy checks for social content.

**Denial explanation and a claim scrubber for psychotherapy codes.** The only open MCP for billing reference data is a 6-star, inactive project. A therapy-specific scrubber plus a CARC/RARC explainer, built on Stedi, is unclaimed.

The things to avoid building are the crowded ones: notes and scribes, generic scheduling, and enterprise voice.

## 10. Where the notes disagree, and what to verify before you commit

### Conflicts between notes

**Target user.** The earlier report framed the demo around a pre-licensed LSW and devoted a legal section to associate paneling. This report replaces that framing everywhere. Supervised-billing rules (BCBSIL's four-trainee cap, HB1085) survive only as group-owner features.

**CAQH cadence.** SimplePractice says every 90 days ([SimplePractice](https://www.simplepractice.com/resource/hidden-costs-diy-insurance-credentialing-solo-therapists/)). CertifyOS says 120 days with no Illinois exception ([CertifyOS](https://www.certifyos.com/guides/caqh-credentialing-guide)). CAQH's own guide and BCBSIL say **120 days, or 180 for Illinois**. The CAQH source wins.

**Credentialing timelines.** Estimates range from 30–90 days (CertifyOS) to 60–180+ days (SimplePractice). Both are vendor figures. Plan for the longer range.

**Mandated reporter training.** One NASW-IL page says once every 3 licensure cycles (June 2025). Another says within 3 months of employment and every 3 years. Unresolved.

**Muse Spark model ID.** The July launch post uses `muse-spark-1.1` ([blog](https://dev.meta.ai/resources/blog/build-with-muse-spark)), and the current docs list `muse-spark-1.3` ([docs](https://dev.meta.ai/docs/overview)). Use the newest model the docs list.

**Meta API terms on health data.** A third-party diff says the April 2025 Llama API terms banned submitting health information and the July 2026 version dropped that clause ([ConductAtlas](https://conductatlas.com/diff/meta/llama-api-terms-of-service/4537/4627/)). No BAA is documented either way.

**Cal.com license.** Older notes call it ambiguous. Newer evidence says the public repo became MIT-licensed **Cal.diy** on Apr 15, 2026, without Workflows ([Cal.com blog](https://cal.com/blog/cal-diy-open-source-to-closed-source)).

**DeskRoute owner and license.** The notes found PrabhatMattoo/DeskRoute under AGPL-3.0. The user previously mentioned a Flux690 owner under ISC. Check the LICENSE file and commit history before reusing any code.

**LobbyStack.** It was found only on GitLab, described as MIT. The GitHub AGPL copy is unverified.

**Star counts.** These differ between snapshots (Postiz 36.7k vs 37.8k; Twenty 58.5k vs 59.7k).

**NPPES API key.** One directory site claims an `api_key` is required. The live keyless call worked, so treat the claim as wrong.

**Medicare telehealth in-person requirement.** CMS's Oct 9, 2026 FAQ and Mentalyc both place it after Dec 31, 2027. Mentalyc partly relies on the CY2027 proposed rule ([Federal Register](https://www.federalregister.gov/documents/2026/07/16/2026-14327/medicare-and-medicaid-programs-cy-2027-payment-policies-under-the-physician-fee-schedule-and-other)). Check the final rule.

### Verify before building or pitching

**Model and agent hosts**
- Whether Meta signs a BAA or offers zero data retention for the Model API.
- Whether Muse Code, Codex and Gemini CLI load `SKILL.md` folders natively, and Muse Code's MCP configuration format. "Muse Code" was not documented in the notes.
- Muse Spark tool calling over Chat Completions with streaming.

**Instagram**
- Meta's long-lived token lifetime and refresh endpoint for Instagram Login.
- The exact App Review and business-verification evidence required for `instagram_business_content_publish`.
- The real daily publishing cap (50 vs 100).

**Billing**
- Stedi's current Real-Time Eligibility endpoint path.
- Claim.MD's BAA.
- Stripe's BAA position on stripe.com itself (only secondary sources were found).
- CPT time thresholds for 90832, 90834 and 90837 (AMA-copyrighted, not in fetched CMS sources).

**Illinois rules and data**
- Illinois record-retention periods (the vendor table's 10 years for adults has no statute cited).
- Illinois DOR estimated-tax and payroll dates.
- The Illinois Medicare MAC (likely WPS J6).
- Whether Illinois requires all-party consent to record. This matters for any future scribe, and was not sourced.
- The LCPC implicit-bias CE hours (the ICA tracker is internally inconsistent).
- The PSC vs PLLC choice and IDFPR's current entity rules (primary pages were blocked).

**Credentialing**
- CAQH, Availity and payer-portal terms on automated access.
- Whether NPPES enforces rate limits.
- Medallion and Verifiable access for small practices.

**Legal**
- Whether counsel reads HB 1806's "emotion detection" ban as covering keyword-based crisis triggers.
- Whether clinician-approved outreach to physicians counts as "communication" under the Act.

**Repos**
- Recent commits for every [R] and [U] row, especially pdf-lib, which is suspected stale (use `@cantoo/pdf-lib`).
- LICENSE files for kaymen99's outreach repo and livekit-examples.

## Conclusion

The research moves the center of gravity away from AI features and toward **practice state and rules**. The hard parts are an obligations table that knows Illinois's dates, a credentialing profile that can fill any form, a claim scrubber that knows psychotherapy codes, and approval and refusal logic that encodes HB 1806, MHDDCA, the anti-referral-fee laws and marketing ethics. Every incumbent has a structural reason to leave those parts unbuilt for the independent owner. Networks profit from keeping credentialing under their tax IDs. EHRs sell clinical workflow. Voice companies chase volume. A portable repo that any agent can run, which knows when to stop and hand the pen to the clinician, is both the compliant design and the differentiator.

The second implication is commercial. The law that makes per-referral pricing illegal also makes the product easier to trust. A flat-fee co-owner that never takes a cut, never signs, never offers therapy and keeps PHI on BAA-covered rails is the pitch judges and clinicians will both believe. The hackathon's synthetic-data limit stops being an apology and becomes the first demonstration of that discipline.
