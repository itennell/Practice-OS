# Demo script

A walk-through of Aeon's Referrals helper for the hackathon video, about 3 minutes. It runs on the local copy at http://localhost:3000 with the fictional demo practice: Dana Reyes, LCPC, Reyes Counseling PLLC, Lincoln Park, Chicago. Her niche is oncology, serious illness and end of life. Every sample row is labeled [Sample].

## Before recording

1. In `lib/features.ts`, `REFERRALS_ONLY_DEMO` is `true` (the app shows only Referrals, the chat, Approvals, Files, Memory and Settings).
2. Run `npm run db:reset` so the practice starts clean with the oncology niche and its [Sample] partners.
3. Run `npm run demo:warm` so the public directories for 60614 are cached and the map fills at once.
4. Run `npm run demo:check`. Every line should pass; fix anything it flags before recording.
5. Use a production build (`npm run build && npm start`) so the developer badge doesn't show.
6. Under the message box, set the mode to **Ask**, so every change waits for an approval on screen.
7. Close other tabs, turn on Do Not Disturb, and set the browser to phone width for the debrief scene.

## The story

A therapist in solo practice fills her caseload through relationships with other professionals: oncologists, hospice teams, palliative care, funeral homes, clergy, cancer nonprofits. Finding them, keeping track and following up is the work nobody has time for. Aeon does it with her, on her own computer, and nothing goes out until she approves it.

## Scenes

### 1. The map fills (40 s)

- Open **Referrals**, search **60614**.
- Point out: the map and the tiered list. Oncologists, hospice and home health agencies, palliative care, genetic counselors, funeral homes and places of worship, each with a "Confirmed by" source (NPPES, Medicare's Provider Data Catalog, OpenStreetMap) and the reasons for its tier.
- Tap a category chip to filter, then open one card.
- Say: "Every partner shows where the information came from."

### 2. Who first this week (25 s)

- In chat: **Who should I reach out to this week?**
- Aeon returns three new partners and any follow-ups due, with reasons tied to her niche.

### 3. An intro letter (30 s)

- In chat: **Draft a letter to my top 3.**
- Open one in Approvals: her phone, her email, the plans she takes, who she helps. Approve it, then **Copy**. The card says Letter ready until she clicks **I sent it**.
- Say: "Aeon never sends. She does, from her own email."

### 4. The coffee debrief (50 s)

- Open the oncology partner's card and press **Debrief** (browser at phone width).
- Speak for about 45 seconds about the meeting: how their office refers (fax), who handles it, their waitlist, the insurance most of their patients have, the best time to call, and a hospice social worker to meet next.
- Aeon shows its steps, then a review card: the partner's profile fields, a suggested new contact, and a follow-up email. Confirm.
- Say: "Anything about a patient is dropped before the AI hears it. The recording is never stored."

### 5. Safety (15 s)

- In chat, type a client's name and birth date. Aeon refuses before anything reaches the model.

### 6. Close (10 s)

- Say: "Free, open source, on her own computer. Aeon builds the relationships that fill a practice, so she can do the therapy."

## Lines to avoid

- Don't say HIPAA compliant. Say: client details are refused before the model sees them, and records stay on her computer.
- Don't promise a number of referrals, clients or a time to a full caseload.
- Don't show Front Desk, Admin or Media; they are switched off for this demo.
