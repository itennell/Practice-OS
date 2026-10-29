# Self-hosting Practice-OS

Practice-OS is free and open source. Each practice runs its own copy on its own computer, with its own accounts. Nobody runs a central Practice-OS service, and nobody else holds her data or her keys.

These pages are for the AI agent doing the setup and for anyone setting it up by hand. Each one has the same steps the app shows in **Settings › Connections**, where every step is checked as she goes.

Start with [INSTALL.md](../../INSTALL.md). Then, only for the helpers she wants:

| Page | For | Cost | Time |
|---|---|---|---|
| [muse.md](muse.md) | Aeon (required) | Pay per use, on her own Meta account | 5 minutes |
| [calcom.md](calcom.md) | Front Desk consult times | Cal.com's free plan works | 10 minutes |
| [phone.md](phone.md) | Front Desk calls and texts | Her phone company's price | 15 minutes, then a review of days |
| [instagram.md](instagram.md) | Instagram posts | Free Meta app; relay hosting depends on the plan | About 30 minutes |
| [google.md](google.md) | Gmail drafts | Free | Later: not ready yet |

`npm run doctor` shows where each one stands (`npm run doctor -- --json` for an agent).

## Where things are kept

- Her practice's records: the built-in database in the `.data` folder.
- Keys she pastes in the app: in that database, encrypted (AES-256-GCM) with a key that lives in `.data` too. They never go into chat and never into git.
- `.env`: settings for developers. A clinician's copy can leave it almost empty.

## Using Supabase instead

Only for someone who already wants a hosted database:

1. supabase.com › New project. Give it its own project; never share one with another app.
2. Connect › Transaction pooler. Copy the address that uses the shared pooler host (`aws-0-<region>.pooler.supabase.com`, port 6543). The `db.<ref>.supabase.co` host is IPv6-only and fails on many home networks.
3. Put it in `.env` as `DATABASE_URL`, the part after `postgres.` as `SUPABASE_PROJECT_REF`, and a new key from `openssl rand -base64 32` as `CONNECTIONS_ENCRYPTION_KEY`.
4. Run `npm run db:migrate`. It only creates and changes the `practice_os` schema.

## Hosting the Instagram relay

The relay ([docs/relay.md](../relay.md)) is the one piece that has to live on the internet, because Meta only signs in to an https address. Choose a host knowing this:

- **Vercel Hobby (free)** is for "non-commercial personal use only", in Vercel's own words. A private practice is a business, so the free plan may not fit her use. Read Vercel's fair-use terms before choosing it.
- **Vercel Pro** (paid, per month) allows commercial use and runs the cleanup job hourly instead of daily.
- **Another host** that runs Node serverless functions and offers public file storage can run `relay/` with small changes. Not tested yet.
- **A tunnel** (for example Cloudflare Tunnel or ngrok to a copy on her computer) is fine for **testing only**. A tunnel URL that changes breaks the Meta redirect address.

Which one to use is her call (or her practice's). Practice-OS works the same with each.
