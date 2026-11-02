# Demo script

A walk-through of Aeon for the hackathon video, about 3 minutes. Everything runs on the local copy at http://localhost:3000 with the fictional demo practice (Dana Reyes, LCPC, Reyes Counseling PLLC). Every sample row is labeled [Sample].

## Before recording

1. Run `npm run db:reset` so the practice starts clean.
2. In the chat box, set the mode under the message box to **Ask**, so every change waits for an approval on screen.
3. Use a production build (`npm run build && npm start`) so the developer badge doesn't show.
4. Close other tabs and turn on Do Not Disturb.

## The story

A therapist just opened a solo practice. She needs clients, and the business side is buried in forms, payers and deadlines. Aeon is a co-owner she talks to. It runs on her own computer, and nothing goes out until she approves it.

## Scenes

### 1. Home: what needs me (20 s)

- Type: **What needs me this week?**
- Point out: real deadlines (CAQH, the PLLC annual report) with the official source link on each.
- Say: "Every rule has a source and the date it was last checked."

### 2. Admin: everything in one place (35 s)

- Type: **My 53-minute session is $175 now.** An approval card shows the old and new fee. Approve it.
- Type: **Make me a Good Faith Estimate for an intake and 12 sessions.** Open the PDF; the new fee is in it.
- Click **Files** in the menu: uploads and everything Aeon made, in one list.
- Upload a sample lease from chat, then ask: **What does it say about the deposit?** Aeon quotes the clause.

### 3. Grow: getting in front of people (50 s)

- Open **Media › Grow**.
- Type: **How many private-pay clients do I need to replace BCBS?** Aeon shows the number and a 12-week plan. If a pay rate is missing, it asks instead of guessing.
- Type: **Draft Google ads with a $300 monthly cap.** Show the policy check passing, then try **Struggling with anxiety?** as a headline. It is blocked, with the reason.
- Type: **Build my website.** Show the preview, and the zip download after approval.
- Say: "Nothing is spent or published. She approves, downloads and launches it herself."

### 4. Referrals (35 s)

- Open **Referrals**, search **60614**.
- Point out: the map, the tiers and the "Confirmed by" source on a card.
- Type: **Draft a letter to my top 3.** Open one: her phone, email and the plans she takes are in it. Approve it; the card says Letter ready until she clicks I sent it.

### 5. Safety (20 s)

- Type a client's name and birth date. Aeon refuses before anything reaches the model.
- Say: "A plain-code crisis check runs before the model on every message. Client details are refused before the model sees them."

### 6. Close (10 s)

- Say: "Free, open source, on her own computer. Aeon does the business side so she can do the therapy."

## Lines to avoid

- Don't say HIPAA compliant. Say: client details are refused before the model sees them, and records stay on her computer.
- Don't promise a number of clients or a time to a full caseload.
- Don't show Front Desk or anything phone-related; it is paused.
