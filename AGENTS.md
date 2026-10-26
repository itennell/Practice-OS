# Practice-OS

## What it is
An open-source AI co-owner, named Aeon, for independently licensed mental health clinicians (LCSW, LCPC, LMFT, psychologist) who run their own private practice in Illinois. It helps them get clients faster and takes the business admin off their plate. It is practice operations software, not clinical care: it never gives medical or mental health advice.

## How the clinician uses it
- She is not technical. She tells any AI coding agent "install Practice-OS from this repo". INSTALL.md walks that agent through every step, asks her for each account in plain words, starts the app and opens http://localhost:3000.
- She works only in the web app, never in the coding agent. The app opens on Aeon's onboarding interview: who she helps, how she works, and her practice stage (beginning: just opening; middle: building a caseload; late: established). The stage decides which helpers switch on first.
- After onboarding she lands on the dashboard: morning brief, approvals inbox, deadlines, referrals, posts, inquiries, and a chat panel to talk to Aeon. The same tools are also exposed through an MCP server so any agent can use them.

## The four helpers
1. Admin: compliance calendar (license renewal, CE hours, CAQH re-attestation, Medicare revalidation, PLLC annual report, quarterly taxes), "how do I" guides, credentialing prep (reading payer PDF forms), Good Faith Estimates.
2. Referrals: find local referral sources with the free NPPES NPI Registry API, track them on a pipeline board, draft outreach letters, follow-up reminders. An approved letter becomes a Gmail draft (gmail.compose scope only); Aeon never sends email, the clinician presses send.
3. Instagram: plan, write and design posts about practice logistics; publish to @practiceos_ after approval.
4. Front Desk: a practice phone number (Twilio). Missed calls go to the clinician's voicemail greeting; the voicemail is transcribed, safety-checked, and the caller gets a text with open consult times from Cal.com. Callers can text the number to book, reschedule or cancel a consult. Also a web chat for the practice website. Questions it can't answer go to the clinician.

## Design system (Caseload)
- Font Inter 400-700. Background #F5F3FC with soft radial glows: lilac #E2D8FF top-left, blue #C9DBFF bottom-right. Ink #17142B, muted text #5D5878, accent #5B47C9 (hover #43349A), primary button #1E1A3A, border #D4CDF0, success #2F7A55. Dark mode surfaces #100D24 and #121022 with accent #8E7CF8.
- Glass cards: white at 64% opacity, 18px backdrop blur, 1px white hairline border, radius 20-28px.
- Aeon is a breathing orb: radial gradient from white to #E3D9FF to #8E7CF8 to #4E69DA, scaling 1 to 1.06 over 4 seconds (no motion if the user prefers reduced motion). Helper orbs: Front Desk blue (#5B9BF0 to #2E5CC8), Referrals violet (#A77BF0 to #6A3FC8), Instagram pink (#E07BC4 to #8C44B8).
- Buttons are pills: primary 50-54px tall, dark #1E1A3A; accent 44px #5B47C9; chips 40px. Inputs are 48px pills. Aeon's chat bubbles are light with the top-left corner cut; the clinician's are dark with the top-right corner cut.
- Onboarding layout: a 340px glass panel on the left with Aeon's orb, her speech bubble and a step list; the step content on the right. App layout: sidebar left, content right. Touch targets at least 44px. Label all sample data as [Sample].

## Architecture (do not change without asking)
- One npm package at the repo root (Node 20 or newer, npm). Next.js App Router app with Tailwind v4 (design tokens above in the @theme block of app/globals.css). Shared code in lib/. MCP server in mcp/server.ts, run with `npx tsx mcp/server.ts` (stdio, @modelcontextprotocol/sdk). It imports from lib/, so there is no second package. The MCP server loads .env itself; MCP client configs never contain secrets and are never committed.
- Database: Postgres via the `postgres` npm library and DATABASE_URL (Supabase pooler). All tables in schema practice_os. Never read or change any other schema. RLS enabled on every table with no policies. Never use the anon key, and never put secrets in NEXT_PUBLIC_ variables. Migrations are numbered SQL files in db/migrations, run by `npm run db:migrate`. `npm run db:reset` truncates only the demo-data tables and reseeds the fake practice; it never touches settings or stored connections (Instagram token). Any fresh-install test uses its own separate Supabase project, never this DATABASE_URL.
- Meta API: lib/meta.ts, base URL https://api.meta.ai/v1, key in MODEL_API_KEY. Chat Completions for muse-spark-1.3 and its tool calls. Responses API for muse-image-1.0 and sam-3.1 (follow github.com/meta-models/meta-model-cookbook folders 05_muse_image and 07_sam). POST /v1/asr/transcribe for muse-voice-transcribe-1.0. Copy request shapes from the cookbook; never guess. Never use a model ID ending in "-contributor". Every call writes a row to practice_os.model_calls (model, feature, tokens, ms, ok).
- Approvals: agents and tools only INSERT into approvals (kind, title, preview, payload, status='pending'). POST /api/approvals/[id]/approve claims the row atomically (UPDATE ... WHERE status='pending' RETURNING) and runs lib/executors/<kind>.ts. Status ends as done or failed with result or error. Executors are the only code that sends, posts or books. DRY_RUN=true makes executors log instead of act. The clinician can mark some kinds as auto-approved in settings (for example, texting a caller their consult options). One exception skips approvals: when the crisis check fires, lib/safety.ts sends the fixed crisis reply and alerts the clinician by text to her own verified phone at once, and writes both to audit_log.
- Stored sign-ins (practice_os.connections) are encrypted with AES-256-GCM in lib/secrets.ts using CONNECTIONS_ENCRYPTION_KEY (in .env and Vercel only). Only lib/connections.ts reads or writes that table; the database refuses plain tokens.
- Instagram needs JPEG images: convert all generated images with sharp.
- Tests: vitest, `npm test`. The same app also deploys to Vercel to receive Twilio and Instagram callbacks; both copies share the database.
- Vercel copy: every page and API route sits behind DEMO_PASSWORD (view only) except the Twilio and Instagram callback routes. Approve buttons there also need ADMIN_PASSWORD, which only I have. Every Twilio route checks the X-Twilio-Signature header and rejects anything unsigned. Twilio routes answer within 15 seconds; transcription, booking and texting run after the response.

## Rules that never change
- Hackathon: Meta Global AI Developer Hackathon, Oct 26 - Nov 4, 2026, Indie track, theme Build for Your World. Everything in this repo is new work built during the event. The repo is public.
- Work only inside this Practice-OS folder. Never read, change, copy from or run anything in my other projects (Vizra, Provisional, Creticos or any other folder). This project has its own Supabase project and its own API keys; never reuse another project's.
- Show me every migration and wait for my OK before running it.
- Approval gate: nothing is sent, posted, booked or submitted until the clinician approves it (or has auto-approved that kind). Every decision is written to audit_log.
- Fake data only. Demo clinician: Dana Reyes, LCPC, Reyes Counseling PLLC, Lincoln Park, Chicago, practice stage: beginning. She is fictional; label her as a fictional demo practice and never show a license number. Her license line on posts is exactly "Dana Reyes, LCPC (fictional demo practice)". Her headshot is generated with muse-image-1.0, never a stock or real photo. Referral letters go only to my own test inbox, never to real providers found in NPPES. Texts go only to my own verified phone.
- The agent never signs, attests or submits a government, payer or CAQH form. It prepares; the clinician submits.
- Illinois HB 1806: the front desk handles logistics only. No therapy advice, no emotional support or empathy phrases, no guessing someone's mood. A plain-code crisis check runs before the model on every message and every voicemail transcript: any mention of self-harm, suicide or danger gets a fixed message (call or text 988; 911 for emergencies) and an urgent alert to the clinician. The front desk says it is an AI assistant on first contact by text or chat.
- Instagram posts cover practice logistics only (first session, fees and superbills, how to book, meet the clinician). No mental health advice, no client stories, no testimonials. A draft that touches suicide or self-harm is blocked, not posted.
- Never charge or pay per referral or per client. No fees, gifts or anything of value tied to referrals.
- Secrets live in .env and in Vercel settings only. .env, .mcp.json, .DS_Store and test/ media are in .gitignore and never committed. A gitleaks scan runs before every commit.

## How to work with me
I don't code. For every task: make a plan first and wait for my OK, build one small step, run and test it, show me the result, explain what changed in plain English in three sentences, add one line to docs/BUILD_LOG.md with today's date, then commit and push with a clear message. If you're unsure, ask me instead of guessing. If you can't take screenshots, say so and give me a URL to open.
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
