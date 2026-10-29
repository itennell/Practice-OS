# Practice phone (Front Desk)

Front Desk listens to her practice line's missed-call voicemails, checks each one for safety, and texts the caller her open consult times. She keeps her own phone company and her own number. Practice-OS never owns or manages her number.

Front Desk also needs [Cal.com](calcom.md) for the consult times.

## Which phone company

| Company | Status in Practice-OS | Notes |
|---|---|---|
| Spruce Health | Built (`lib/frontdesk/phone/spruce.ts`), shown on the Practice phone card | Spruce signs a HIPAA business associate agreement (BAA) on every plan. API access is turned on by Spruce Support on request. |
| Quo (OpenPhone) | Later | Listed as the fallback. |
| Twilio | Built for the developer's own demo line only (`FRONT_DESK_DEV_TWILIO`) | Not offered to clinicians yet. Facts below for when it is. |

## Spruce steps (the same as Settings › Connections › Practice phone)

1. In the Spruce app, open **Help** and send Spruce the message the card shows (press **Copy the message**). She only does this once. You should get a reply from Spruce saying API access is on. This can take a day or more.
2. In Spruce, go to **Settings**, then **API Access**, and press **Create token**.
3. Paste the token into **Spruce token** on the card and press **Connect**. Practice-OS checks it right away.
4. You should see **Connected** and her practice number.

## Twilio facts (checked 2026-10-29)

Twilio isn't offered to clinicians yet. If it is, this is what she should know before starting:

- **Account:** a paid account. A trial account can only text up to 5 verified numbers and can't be verified for texting.
- **Number:** a toll-free number costs about $2 a month plus usage.
- **Toll-free verification:** before a toll-free number can text people in the US or Canada, Twilio has to approve it. She fills in her business name and address, what the texts are for, and how callers agree to get them. There's no fee for the review.
- **While it's in review:** texts to US and Canadian phones fail (Twilio error 30032) and are still billed. Calls and voicemail work. Twilio says about 3 to 5 business days; it can take 2 to 3 weeks when they're busy.
- **No public address needed:** Practice-OS reads new voicemails and texts by asking Twilio every minute, and the greeting comes from a TwiML Bin hosted by Twilio. Her computer doesn't need to be reachable from the internet, but it does need to be on, with the app running.

## Safety

A plain-code crisis check runs on every voicemail transcript and text before anything else. Any mention of self-harm, suicide or danger gets a fixed reply (call or text 988; 911 for emergencies) and an urgent text to her own phone (`CLINICIAN_ALERT_PHONE`).
