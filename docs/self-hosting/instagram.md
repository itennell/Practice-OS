# Instagram (self-hosted)

Aeon writes and designs posts about her practice's logistics, and each one goes to her Instagram only after she approves it. To post, she needs two things of her own:

- **(a) Her own Meta developer app.** Free. It lets Practice-OS sign in to her Instagram.
- **(b) Her own Connect relay.** A small web service (`relay/`) that finishes the sign-in and holds each post's picture for at most an hour, because Instagram fetches pictures from a public address. See [docs/relay.md](../relay.md). Choose a host first: see [Hosting the Instagram relay](README.md#hosting-the-instagram-relay).

Time: about 30 minutes. Do the steps in this order, because each one needs something from the one before.

Checked 2026-10-29 against Meta's "Instagram API with Instagram Login" docs. Meta moves menus often. Where its docs don't name a menu, the steps below say so.

## Before you start

- Her Instagram must be a **professional account** (Business or Creator). Instagram app › Settings › Account type and tools › Switch to professional account. No Facebook Page is needed.
- The account must be **public** to be added as a tester.

## (a) Her Meta app

1. Open https://developers.facebook.com/apps and sign in with the Facebook account that manages her Instagram. If it's her first time, Meta asks her to register as a developer (free).
2. Press **Create app**. For the use case choose **Other**, then app type **Business**. Name it something like "Reyes Counseling posts". You should see the app's dashboard.
3. Under **Add products to your app**, find **Instagram** and press **Set up**.
4. Open **Instagram › API setup with Instagram login**. Copy the **Instagram app ID** and **Instagram app secret** from there. They are not the same as the app ID at the top of the page, and the wrong pair gives "Invalid platform app".
5. Keep this tab open: step 9 comes back here to add the relay's address.

## (b) Her relay

6. In Practice-OS, open **Settings › Connections › Instagram**. The card makes two random keys for her relay (the relay's state key and its cleanup key) with a **Copy** button for each. An agent can make them instead with `openssl rand -base64 32`, twice.
7. Press **Deploy the relay** on the card. It opens Vercel with `relay/` chosen, its name set to `practice-os-relay`, and a Blob store (for the post pictures) added. The same link:

   ```text
   https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fitennell%2FPractice-OS&root-directory=relay&project-name=practice-os-relay&repository-name=practice-os-relay&envDescription=Your%20Instagram%20app%20ID%20and%20secret%20from%20your%20Meta%20app%2C%20plus%20two%20keys%20Practice-OS%20makes%20for%20you%20in%20Settings%20%E2%80%BA%20Connections%20%E2%80%BA%20Instagram.&envLink=https%3A%2F%2Fgithub.com%2Fitennell%2FPractice-OS%2Fblob%2Fmain%2Fdocs%2Fself-hosting%2Finstagram.md&stores=%5B%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22public%22%7D%5D&env=INSTAGRAM_APP_ID,INSTAGRAM_APP_SECRET,RELAY_STATE_KEY,CRON_SECRET
   ```

   Vercel asks for four values: `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` from step 4, `RELAY_STATE_KEY` and `CRON_SECRET` from step 6. Vercel fills in the Blob store's token itself. Press **Deploy** and wait until Vercel says it's done (about 2 minutes).
8. Copy the relay's address from Vercel (it looks like `https://practice-os-relay.vercel.app`). Open that address with `/api/health` on the end. You should see `"ready": true` and `"images": true`. The relay uses Vercel's own address for itself, so there's no `RELAY_URL` to type.

## Join the two

9. Back in the Meta app: **Instagram › API setup with Instagram login › Set up Instagram business login › Business login settings**. Under **OAuth redirect URIs**, add exactly `<relay address>/api/connect/instagram/callback` (the card shows it with a **Copy** button). Press **Save**.
10. Add her Instagram as a tester: **App roles › Roles**, or **Instagram › API setup with Instagram login › Generate access tokens › Add account**. Meta's docs don't name the role, and guides call it "Instagram Tester".
11. Accept the invite **inside Instagram**: Instagram app › Settings › Apps and websites › Tester invites › Accept. On a computer: https://www.instagram.com/accounts/manage_connections/. Only guides describe this screen; Meta's docs don't show it.
12. Paste the relay address into **Your relay address** on the Practice-OS card. It checks the relay straight away.
13. Press **Connect Instagram**. Instagram's own sign-in page opens. Sign in and allow. You should come back to Practice-OS and see **Connected · @her_account**.

## While the Meta app is in Development mode

Meta's docs say the default access level is "enough" for accounts you own or manage, which fits a practice posting to its own account. Another page says App Review is needed "before your app can access live data". Whether posting to her own account works with no App Review at all **hasn't been confirmed by a live test yet**. Practice-OS asks only for `instagram_business_basic` and `instagram_business_content_publish`.

## If it doesn't work

| What she sees | What it means | What to do |
|---|---|---|
| "Instagram isn't ready on this copy yet." | The relay address is missing or the relay is missing a setting. | Run `npm run doctor`. It names the missing setting. |
| `/api/health` shows `"ready": false` | A Vercel setting is missing or wrong. | Vercel › the relay project › Settings › Environment Variables. Fix the one marked `false`, then Redeploy. |
| `"images": false` | No Blob store, or no `CRON_SECRET`. | Vercel › the relay project › Storage › Connect a Blob store (public). |
| "Invalid platform app" | The app ID from the top of the Meta page was used. | Use the Instagram app ID and secret from step 4. |
| "Invalid redirect URI" | Step 9's address doesn't match exactly. | Copy it again from the card, with no slash at the end. |
| Sign-in works but there's no account to pick | Her Instagram isn't a professional account, or the tester invite wasn't accepted. | Steps "Before you start" and 11. |
| Posts fail after about 60 days | The sign-in ran out. Practice-OS renews it in the last week; if the app was off all that week, it can't. | Press **Connect again**. |

## Turning it off

In Practice-OS: Settings › Connections › Instagram › Disconnect. In Instagram: Settings › Website permissions › Apps and websites › remove the app.
