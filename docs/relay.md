# The Connect relay

`relay/` is a small Vercel project, separate from the app, with no database.
It does three things and nothing else:

1. **Instagram sign-in.** Meta only returns a sign-in to a registered https
   address, and swapping the code for a token needs the app secret. The app
   asks the relay to begin (`POST /api/connect/instagram/begin`, sent from the
   app's server with a one-time key). Meta sends the clinician to
   `/api/connect/instagram/callback`. The relay swaps the code for a
   long-lived token, seals the token with the app's one-time key, and sends
   her browser back to the app on her computer. Only `practiceos://` and
   `http://127.0.0.1` or `http://localhost` addresses are allowed as return
   targets. The token never appears in a URL unsealed, and the relay keeps
   nothing.
2. **Post images.** Instagram fetches each image from a public address.
   - **Upload:** the app uploads the JPEG with `POST /api/images`. It must send the upload key the relay sealed into her sign-in (an HMAC over her Instagram user id with `RELAY_STATE_KEY`), so no other Instagram app or token can use the relay as free hosting.
   - **Checks:** the relay decodes each upload with sharp and accepts only a JPEG no bigger than 4 MB and 8192 px a side. The size is checked before the body is read. It takes at most 20 uploads an hour per account.
   - **Removal:** the app deletes the image (`DELETE /api/images`) as soon as Instagram's media container is FINISHED. Any image left behind is deleted after an hour, at the next upload from that account or by the daily cron.
   - **Caching:** images are served with a 10-minute cache, so the CDN stops showing a deleted image quickly.
3. **Cleanup.** A daily cron (`/api/prune`) deletes any image older than an
   hour that an upload or the app didn't already clear. (Vercel's free plan
   runs crons once a day; on Pro it can run hourly.)

Google doesn't use the relay. Its sign-in returns straight to the app on her
computer (a Desktop-app client with PKCE).

## Settings in the relay's Vercel project

| Name | What it is |
|---|---|
| `RELAY_URL` | The relay's own address, e.g. `https://practice-os-relay.vercel.app` |
| `RELAY_STATE_KEY` | Made once with `openssl rand -base64 32` |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | From the Meta app's Instagram > API setup with Instagram login |
| `CRON_SECRET` | Made once with `openssl rand -base64 32`. Vercel sends it to the cron |
| `BLOB_READ_WRITE_TOKEN` | Added by Vercel when a Blob store is connected to the project |

In the Meta app, the valid OAuth redirect URI is `<RELAY_URL>/api/connect/instagram/callback`.

The app needs only `RELAY_URL` in its `.env`. Code lives in `relay/lib/handlers.ts`;
`tests/relay.test.ts` runs it without the network.
