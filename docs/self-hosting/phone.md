# Practice phone (Front Desk)

Front Desk takes the voicemails left on her practice line, checks each one for safety, and texts the caller her open consult times. Callers can text the number to book, move or cancel a consult. She uses her own phone account and her own number. Practice-OS never owns or manages her number.

Front Desk also needs [Cal.com](calcom.md) for the consult times.

Twilio is the default. Spruce Health is the alternative (below).

## What it costs and how long it takes (checked 2026-10-29)

- **Account:** Twilio is pay as you go. A trial account can only text up to 5 numbers she has verified and can't be approved for texting, so she adds a payment card to upgrade.
- **Number:** a toll-free number costs about $2 a month, plus a little per call minute and per text.
- **Approval for texting (toll-free verification):** before a toll-free number can text people in the US or Canada, the phone carriers have to approve it. She fills in a form in Twilio: her business name and address, what the texts are for, and how callers agree to get them. There's no fee. It usually takes 3 to 15 business days, sometimes longer when Twilio is busy.
- **While it's waiting:** calls and voicemail work, and Aeon reads the voicemails. Texts to callers don't go out yet (Twilio says error 30032 and still charges for them). The card shows where the review stands.

## How it works on her computer

Practice-OS asks Twilio every minute for new voicemails and texts while the app is open, and sends texts through Twilio. Her computer doesn't need to be reachable from the internet. When she connects, Practice-OS sets her number to play her greeting and record a message, using a small Twilio-hosted page (Twilio's "echo" Twimlet), so there's nothing for her to set up in Twilio for voicemail. Calls to the number go straight to her greeting and voicemail.

The app has to be running for Front Desk to answer. Voicemails left while her computer is off are picked up the next time it's on.

## Twilio steps (the same as Settings › Connections › Practice phone)

1. Make a Twilio account: https://www.twilio.com/try-twilio. You should see the Twilio Console home page.
2. Upgrade the account by adding a payment card (Console › Admin › Billing, or the **Upgrade** button). You should no longer see "Trial" at the top.
3. Buy a toll-free number: **Phone Numbers › Manage › Buy a number**, choose **Toll-free**, then **Buy**. You should see it under **Phone Numbers › Manage › Active numbers**. Twilio may ask for a business profile first; fill it in with the practice's details.
4. On the Console home page, find **Account Info**. Copy the **Account SID** and the **Auth Token** (press the eye to show it) and paste them into the card. Practice-OS checks them straight away, finds the toll-free number, and sets up voicemail on it. If there's more than one number, it asks which one.
5. Ask for texting approval: **Messaging › Regulatory compliance › Toll-free verifications** (Twilio moves this menu sometimes; searching "toll-free verification" in the Console finds it). Pick the number and fill in the form. For "use case", say the texts are appointment scheduling for people who called the practice and left a voicemail. The card shows "in review" until the carriers approve it.

When the card says **Connected** with her number, Front Desk is working.

## If it doesn't work

| What she sees | What to do |
|---|---|
| "Twilio didn't accept those keys" | Copy the Account SID (starts with AC) and the Auth Token again from the Console home page. |
| "No toll-free number on this account" | Buy one (step 3), then press Check again. |
| Texts say "in review" for weeks | In Twilio, open the verification and check for a message asking for changes. Fix it and resubmit; resubmissions within 7 days get priority. |
| Texting was turned down | The card says so. Calls and voicemail still work. Resubmit with clearer opt-in wording. |

## Spruce Health (alternative)

Spruce signs a HIPAA business associate agreement (BAA) on every plan, and Spruce turns on API access when asked.

1. In the Spruce app, open **Help** and send Spruce the message the card shows (press **Copy the message**). Spruce replies when API access is on, which can take a day or more.
2. In Spruce, go to **Settings › API Access** and press **Create token**.
3. Paste the token into the card and press **Connect**. Practice-OS checks it straight away.

## A note on privacy

Twilio signs a BAA only on its Security or Enterprise editions, through sales. Until there's a BAA, Front Desk handles scheduling logistics only, and Practice-OS keeps client details out of Aeon's memory.

## Safety

A plain-code crisis check runs on every voicemail transcript and text before anything else. Any mention of self-harm, suicide or danger gets a fixed reply (call or text 988; 911 for emergencies) and an urgent text to her own phone.
