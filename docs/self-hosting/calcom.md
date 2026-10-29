# Cal.com (consult times)

Front Desk offers callers her open consult times from Cal.com and books the one they pick. Only a reference number (like "Phone consult FD-1042") goes on the booking. Cost: Cal.com's free plan works. Time: about 10 minutes.

Checked 2026-10-29. Cal.com's API v2 docs point to Settings › Security in one place and Settings › Developer › API keys in another. The app's button opens the API keys page directly: https://app.cal.com/settings/developer/api-keys. Live keys start with `cal_live_`, test keys with `cal_`.

## Steps (the same as Settings › Connections › Cal.com)

1. If she has no Cal.com account: open https://cal.com/signup and make one. You should land on her Cal.com home page.
2. In Cal.com, open **Availability** and set the hours she takes consult calls. You should see her week with those hours.
3. In Practice-OS, press **Connect Cal.com**. Cal.com's API keys page opens in a new tab.
4. In Cal.com, press **+ New**.
5. Name it **Practice-OS**, choose **Never expires**, then press **Create**.
6. Press **Copy**. Come back to Practice-OS and paste it into **Paste your Cal.com key**. It checks the key as soon as she pastes.
7. You should see **Connected ✓** and her next open consult time. Practice-OS finds her 15-minute consult event, or makes one if there isn't one.

## If it doesn't work

| What she sees | What to do |
|---|---|
| The key is refused | Copy the whole key again, starting with `cal_`. |
| "No open times this week" | Add hours in Cal.com › Availability, then press Check. |
| Couldn't reach Cal.com | Try again in a minute. |

## For developers

`CALCOM_API_KEY` and `CALCOM_EVENT_TYPE_ID` in `.env` are only for the spike scripts. The app keeps the key encrypted in the database.
