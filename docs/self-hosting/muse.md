# Muse key (Aeon's thinking)

Aeon thinks with Meta's Muse models, using her own key. Without it Aeon can't answer. Cost: pay per use on her own Meta developer account. Time: about 5 minutes.

Checked 2026-10-29. Meta's sign-up page is https://dev.meta.ai/ (developer.meta.com/ai/products/meta-model-api/ sends you there). Meta's official page only says it makes a key in one click. The menu names below come from guides and may move.

## Steps (the same as Settings › Connections › Aeon (Meta Muse))

1. Open Meta's developer page: https://dev.meta.ai/. You should see a sign-in page.
2. Sign in with your Facebook or Meta account. You should see your dashboard.
3. Go to **API keys**, choose **Create key**, then **Copy**. Meta shows the key only once.
4. Come back to Practice-OS and paste it into **Your Muse key**. Press **Check and connect**.
5. You should see **Connected** and "Key ending" with its last four characters.

The onboarding interview asks for the same key in chapter 6, "Connect your tools".

## If it doesn't work

| What she sees | What it means | What to do |
|---|---|---|
| "Meta didn't accept that key" | The key was mistyped, deleted or is for another product. | Make a new key and paste it again. |
| "Couldn't reach Meta" | No internet, or Meta is down. | Try again in a minute. |

## For developers

A key in `.env` as `MODEL_API_KEY` wins over the one saved in the app. Never commit it.
