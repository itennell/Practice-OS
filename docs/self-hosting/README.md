# Self-hosting Practice-OS

Practice-OS is free and open source. Each practice runs its own copy on its own computer, with its own accounts. Nobody runs a central Practice-OS service, and nobody else holds her data or her keys.

These pages are for the AI agent doing the setup and for anyone setting it up by hand. Each one has the same steps the app shows in **Settings › Connections**, where every step is checked as she goes.

Start with [INSTALL.md](../../INSTALL.md). Then:

| Page | For | Cost | Time |
|---|---|---|---|
| [muse.md](muse.md) | Aeon (required) | Pay per use, on her own Meta account | 5 minutes |

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
