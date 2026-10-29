# Google (Gmail drafts): later

Approved referral letters can become Gmail drafts that she sends herself. The code is in place (`lib/connect/google.ts`, a Desktop-app client with PKCE), but it isn't ready for self-hosting yet. For now, referral letters show as a preview inside the app.

Why it waits (checked 2026-10-29):

- A Google Cloud project left in **Testing** signs her out every 7 days: Google expires the sign-in and its refresh token a week after she agrees.
- Gmail drafts need the `gmail.compose` permission, which Google calls a **restricted** scope. Publishing an app with it for everyone needs Google's verification and likely a security assessment.
- An unverified app in production shows her an "unverified app" warning and is capped at 100 users for the project's lifetime. That might work for one practice, but it hasn't been tested yet.

When it's ready, this page will have the steps: make a Google Cloud project, turn on the Gmail API, set up the consent screen, create an OAuth client of type **Desktop app**, and put its ID in `.env` as `GOOGLE_CLIENT_ID`.
