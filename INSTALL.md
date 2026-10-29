# Installing Practice-OS

**For the AI agent doing the install** (Muse Code, Claude Code, Codex or similar), when someone says "install Practice-OS from this repo".

The person you're helping is a therapist, not a programmer. Follow these rules the whole way through:

- Do every command yourself. Never ask her to edit a file or type a command.
- Ask for one thing at a time, in plain words. Before you ask for an account, tell her what it costs and how long it takes.
- **Never ask her to paste a key, password or token into this chat.** Keys go into the app (Settings › Connections), where each one is checked and stored encrypted. If she pastes one here anyway, don't repeat it, and don't write it anywhere except where this guide says.
- Never commit `.env`. Never print a secret back.
- If anything here doesn't match what you see, stop and ask her.

Practice-OS is free and open source. Everything runs on her own computer and her own accounts. No Practice-OS company holds her data or her keys.

What she ends up with: the Practice-OS web app at http://localhost:3000, open on Aeon's onboarding interview.

## 1. Check the computer (about 2 minutes)

1. Check that Node is 20 or newer: `node --version` (any version from 20 up works). If it's older or missing, tell her: "I need to install Node, a free program Practice-OS runs on." Then install the LTS version from nodejs.org (on a Mac, Homebrew `brew install node@22` works too).
2. Check that git is there: `git --version`. On a Mac, a missing git prompts to install Apple's command-line tools. Tell her to press **Install** and wait.
3. Pick a folder that is **not** synced (not iCloud Drive, Desktop or Documents when those sync, Dropbox, OneDrive or Google Drive). `~/Practice-OS` in her home folder is a good choice. A synced folder can corrupt the database and would copy her keys to that service. If `~/Practice-OS` already exists, ask her whether it's an earlier copy (then `cd` into it and run `git pull`) before making a new one.

## 2. Get the code (about 5 minutes)

1. Clone it: `git clone https://github.com/itennell/Practice-OS ~/Practice-OS && cd ~/Practice-OS`.
2. Install: `npm install` (under a minute). Warnings about deprecated packages or install scripts are normal; don't stop for them.
3. Copy the settings template: `cp .env.example .env`. Leave every value empty for now. The app works with an empty `.env`.
4. Download the privacy checker: `npm run models:download` (about 108 MB, once; under a minute on a fast connection). Tell her: "I'm downloading the privacy checker that keeps client names out of Aeon's chat. It stays on your computer." Aeon's chat stays closed until it's in place.

## 3. The database (nothing to do)

Leave `DATABASE_URL` and `CONNECTIONS_ENCRYPTION_KEY` empty. Practice-OS then runs its own built-in database on her computer, in the `.data` folder, and makes its own encryption key there. Tell her: "Your practice's records stay in one folder on this computer, and a backup is made before every update."

- Never delete `.data`. It holds her practice, the keys that unlock her saved sign-ins, and her encrypted backups (`.data/backups`).
- It keeps running after the app stops. `npm run db:stop` stops it.
- To keep the data somewhere else, set `PRACTICE_OS_DATA_DIR` in `.env` to that folder (same rule: not a synced folder). Most people never need this.
- Supabase is optional and only for someone who already wants it. See [docs/self-hosting/README.md](docs/self-hosting/README.md#using-supabase-instead).

## 4. Start the app

1. Start the app and leave it running: `npm run dev`. If your tools can't keep a terminal open, run it in the background with `nohup npm run dev > dev.log 2>&1 &`. The first start takes about 10 seconds while it sets up the database.
2. Run `npm run doctor`. Everything marked ✓ is done. Everything marked · can wait.
3. Open http://localhost:3000 for her. She should see Aeon's onboarding interview: Aeon's orb on the left, one question ("What's your name?") on the right. The home page sends a new practice to `/onboarding` from the browser, so if you check with curl, check http://localhost:3000/onboarding (it answers 200).

From here she works in the app. The interview asks for everything else, one question per screen, and she can skip anything and finish it later from the home page.

## 5. Accounts (one at a time, only when she wants that helper)

Only the Muse key is needed to start. Instagram needs no connection: Aeon writes posts with her, and she posts them herself. Everything else is optional and can be set up later from **Settings › Connections**, which walks her through each one step by step with a check after every step. Offer them in this order, and say the cost and time first:

| What | Needed for | Cost | Time | Guide |
|---|---|---|---|---|
| Muse key (Meta) | Aeon answering at all | Per use, on her own Meta account | 5 minutes | [muse.md](docs/self-hosting/muse.md) |
| Cal.com | Front Desk offering consult times | Free plan works | 10 minutes | [calcom.md](docs/self-hosting/calcom.md) |
| Practice phone (Twilio) | Front Desk answering voicemails and texts | About $2 a month for the number, plus a little per call and text | 20 minutes, then 3 to 15 business days before texts go out | [phone.md](docs/self-hosting/phone.md) |
| Google (Gmail drafts) | Referral letters as Gmail drafts | Free | Later: not ready for self-hosting yet | [google.md](docs/self-hosting/google.md) |

How to help her with each one:

1. Open the matching guide above and Settings › Connections in her browser.
2. Read her the next step from the card, in the card's own words. Don't skip ahead.
3. When she has copied a key, tell her to paste it into the box on the card, not here. The card checks it straight away and shows a green check.
4. Run `npm run doctor -- --json` to confirm, then move to the next one only if she wants to.

Leave `DRY_RUN=true` in `.env` until she has tried everything. While it's on, nothing is really sent, posted or booked.

## 6. Connect Aeon's tools to her coding agent (optional)

The MCP server reads `.env` itself, so the agent config holds no secrets. Use her repo's absolute path in place of `/path/to/Practice-OS`.

**Muse Code** (`~/.config/muse/settings.json`):

```json
"mcpServers": {
  "practice-os": {
    "type": "stdio",
    "command": "npx",
    "args": ["--no-install", "--prefix", "/path/to/Practice-OS", "tsx", "/path/to/Practice-OS/mcp/server.ts"],
    "mode": "optional"
  }
}
```

**Claude Code**:

```bash
claude mcp add practice-os -s user -- npx --no-install --prefix /path/to/Practice-OS tsx /path/to/Practice-OS/mcp/server.ts
```

Check it: ask the agent "What needs me this week?" It should call `morning_brief`. Nothing is sent, posted or booked without her approval in the app.

Skills in this repo for her agent: `skills/admin/SKILL.md` (everyday practice admin) and `skills/admin/state-research/SKILL.md` (her state's rules if she practices **outside Illinois**; the rules wait in her approvals until she confirms them).

## 7. Check it worked

- `npm run doctor` ends with "Ready", or with "Not ready yet: Aeon's Muse key" until she pastes her key in the app. Every other line is ✓ or ·.
- `npm test` passes. It uses a throwaway database of its own, never hers.
- http://localhost:3000 shows the onboarding interview (or her home page, once she has finished it).

## If something goes wrong

| What you see | What to do |
|---|---|
| `npm install` fails on `sharp` or `onnxruntime` | Check Node is 20 or newer, delete `node_modules`, run `npm install` again. |
| Port 3000 is in use | Another copy is running. Stop it, or run `npm run dev -- -p 3001` and open that address instead. |
| You need to stop the app | Stop the `npm run dev` process (Ctrl+C, or `kill` its process id). `npm run db:stop` then stops the database. |
| "Aeon can't answer" | The Muse key is missing or was rejected. Settings › Connections › Aeon (Meta Muse). |
| Chat says the privacy checker is missing | Run `npm run models:download`. |
| The database won't start | Run `npm run db:stop`, then `npm run dev` again. Never delete `.data`. |
