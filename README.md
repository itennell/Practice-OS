# Practice-OS

Aeon is an open-source AI co-owner for independently licensed mental health clinicians (LCSW, LCPC, LMFT, psychologist) running their own private practice in Illinois. It helps them get clients faster and takes the business admin off their plate.

It is practice operations software, not clinical care. It never gives medical or mental health advice, and nothing is sent, posted or booked until the clinician approves it.

## Four helpers

- **Admin**: compliance calendar, "how do I" guides, credentialing prep, Good Faith Estimates.
- **Referrals**: find local referral sources (NPPES NPI Registry), track them, draft outreach letters as Gmail drafts.
- **Instagram**: plan, write and design posts about practice logistics.
- **Front Desk**: a practice phone number that handles missed calls, voicemail and consult booking by text, plus a web chat.

## Install

Tell any AI coding agent: "install Practice-OS from this repo". It follows INSTALL.md (coming soon), asks for each account in plain words, and opens the app at http://localhost:3000.

By hand: Node 20 or newer, then

```bash
npm install
cp .env.example .env
npm run dev
```

The MCP server: `npm run mcp`. Tests: `npm test`.

## Demo data

The demo practice is fictional: Dana Reyes, LCPC, Reyes Counseling PLLC, Lincoln Park, Chicago. All sample data is labeled [Sample].

## Built during the hackathon (Oct 26 - Nov 4, 2026)

Everything in this repository was built from scratch during the Meta Global AI Developer Hackathon (Indie track, theme: Build for Your World), October 26 to November 4, 2026. The day-by-day record is in [docs/BUILD_LOG.md](docs/BUILD_LOG.md).
