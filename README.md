# Practice-OS

Aeon is an open-source AI co-owner for independently licensed mental health clinicians (LCSW, LCPC, LMFT, psychologist) running their own private practice in any US state (Illinois rules ship verified; other states are researched and confirmed by the clinician). It helps them get clients faster and takes the business admin off their plate.

It is practice operations software, not clinical care. It never gives medical or mental health advice, and nothing is sent, posted or booked until the clinician approves it.

**The pitch:** what therapist marketing agencies and practice coaches sell as a monthly service (a new website, ads, search rankings, a plan to move from insurance to private pay), plus the paperwork, as a free AI co-owner that runs on her own computer. She owns all of it.

Practice-OS is built by **Caseload** (a sole proprietorship).

## Text messages

(The Front Desk helper is paused and hidden in the app for now.) The Front Desk helper texts people who call a practice line and leave a voicemail, to offer times for a free consultation. Scheduling only, never marketing. Reply STOP to opt out, HELP for help. Message and data rates may apply. During the demo, the practice (Reyes Counseling) is fictional and texts go only to the developer's own phone.

- [Privacy Policy](docs/privacy-policy.md)
- [Terms & Conditions](docs/terms.md)
- [How SMS opt-in works](docs/sms-opt-in.md)

## The hackathon demo: Referrals

The demo shows one helper end to end: **Referrals**, a relationship engine for the professionals who send a therapist clients (oncologists, hospice and palliative teams, funeral homes, clergy, cancer nonprofits and more). It finds them from public sources, ranks them for her niche with the reasons shown, drafts intro letters she copies and sends herself, and turns a spoken coffee-meeting debrief into a partner profile and a follow-up. Turn it on with `REFERRALS_ONLY_DEMO` in `lib/features.ts`; turn it off to get the full app. The walk-through is in [docs/demo-script.md](docs/demo-script.md).

## Three helpers

- **Admin**: everything in one place. A compliance calendar with sourced rules, practice settings she changes by talking to Aeon, client forms, Good Faith Estimates, superbills, an insurance hub by license, credentialing prep, and a Files page with every upload and every document Aeon made.
- **Media**: getting her in front of people. The Grow tab works out how many private-pay clients replace each insurance panel, drafts Google and Facebook/Instagram ads that pass a health-ad policy check, and writes a one-page website she owns. Also her Psychology Today profile and Instagram posts about practice logistics. Nothing is spent or published: she approves, downloads and launches it herself.
- **Referrals**: local referral sources from the NPPES NPI Registry and other public sources, on a map and a ranked list, with outreach letters she copies and sends from her own email.

## Why not just use a chatbot?

A chatbot gives advice. Aeon runs the business side of the practice.

- **It works while she's away.** Deadlines are tracked and follow-ups are lined up without anyone asking.
- **It remembers her practice.** Her fees, hours, payers and decisions carry over from one day to the next.
- **Its rules have sources.** Every deadline carries the official link, the quoted rule and the date it was last checked.
- **Its safety is built for therapy.** A plain-code crisis check runs before the model on every message, and Aeon never gives therapy advice.
- **It finishes the paperwork.** Good Faith Estimates, superbills and credentialing forms come out filled in, ready for her to check and submit.
- **It runs on her own computer.** Her records stay in one folder on her machine, with her own accounts and keys.

## Install

Practice-OS is free and open source, and each practice hosts its own copy. There is no central service.

Tell any AI coding agent: "install Practice-OS from this repo". It follows [INSTALL.md](INSTALL.md), asks for each account in plain words, and opens the app at http://localhost:3000. Step-by-step guides for each service are in [docs/self-hosting](docs/self-hosting/README.md).

By hand: Node 20 or newer, then

```bash
npm install
cp .env.example .env
npm run dev
```

`npm run doctor` says what is set up and what is next. The MCP server: `npm run mcp`. Tests: `npm test`.

## Roadmap

- Aeon plugs into the business tools you already use (bookkeeping, payroll, storage) through MCP.

## Demo data

The demo practice is fictional: Dana Reyes, LCPC, Reyes Counseling PLLC, Lincoln Park, Chicago. All sample data is labeled [Sample].

## Built during the hackathon (Oct 26 - Nov 4, 2026)

Everything in this repository was built from scratch during the Meta Global AI Developer Hackathon (Indie track, theme: Build for Your World), October 26 to November 4, 2026. The day-by-day record is in [docs/BUILD_LOG.md](docs/BUILD_LOG.md).
