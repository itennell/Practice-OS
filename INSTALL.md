# Installing Practice-OS

**For the AI agent doing the install** (Muse Code, Claude Code or similar). The clinician is not technical: ask her for one thing at a time, in plain words, say where to find it, and never ask her to edit a file or run a command herself. Never print a secret back to her, never commit `.env`, and stop to ask if anything here doesn't match what you see.

What she gets: the Practice-OS web app at http://localhost:3000, and Aeon's tools connected to her coding agent through MCP.

## 1. Get the code and tools

1. Check Node is 20 or newer: `node --version`. If it's older or missing, help her install Node 20+ from nodejs.org.
2. Clone the repo and install: `git clone https://github.com/itennell/Practice-OS && cd Practice-OS && npm install`.
3. Copy the settings template: `cp .env.example .env`. You fill in `.env` from her answers; each line in `.env.example` says where the value comes from.
4. Download Aeon's privacy checker: `npm run models:download` (about 108 MB, once; a few minutes on a slow connection). It is a small name-finder that runs on her computer and stops client names from reaching Aeon's model or the database. Tell her: "I'm downloading the privacy checker that keeps client names out of Aeon's chat. It stays on your computer." Chat refuses messages until it is in place.

## 2. Accounts (ask for these one at a time)

Required to start:

| Setting | Ask her for | Where it comes from |
|---|---|---|
| `MODEL_API_KEY` | Her Meta Model API key, or nothing | api.meta.ai > API keys. Muse powers Aeon, the state research and the front desk. She can also paste it herself in Settings › Connections, where it is checked and kept encrypted. |
| `DRY_RUN` | Nothing | Leave `true` until she has tested everything. |

Leave `DATABASE_URL` and `CONNECTIONS_ENCRYPTION_KEY` empty. Practice-OS then runs its own built-in database on her computer, in the `.data` folder, and generates the encryption key there itself. Tell her: "Your practice's data stays in one folder on this computer, and a backup is taken before every update." Only if she already wants Supabase instead: set `DATABASE_URL` and `SUPABASE_PROJECT_REF` (supabase.com > New project > Connect > Transaction pooler; use the shared pooler host, not `db.<ref>.supabase.co`, which is IPv6-only) and `CONNECTIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`).

Google (Gmail drafts, Calendar) and Instagram connect from Settings › Connections with the company's own sign-in page. They need `GOOGLE_CLIENT_ID` (a Desktop-app client) and `RELAY_URL` (the Connect relay, docs/relay.md) in `.env`.

Later, only for the helpers she turns on (Front Desk: Twilio, Cal.com; Referrals: Google; Instagram: Meta app). Each is described in `.env.example`.

Optional for maintainers: `FIRECRAWL_URL` (a self-hosted Firecrawl) runs the live source checks in `tests/rule-sources.test.ts`. Clinicians don't need it: state research uses Muse's own web search.

## 3. Database

1. Built-in database (no `DATABASE_URL`): nothing to do. The app creates and updates its database when it starts. It stays running after the app stops; `npm run db:stop` stops it. Never delete the `.data` folder: it is her practice.
2. Supabase (`DATABASE_URL` set): run `npm run db:migrate`. It creates the `practice_os` schema and its tables, each with row-level security on. It never touches any other schema.
3. Optional, to look around first: `npm run db:reset` loads the fictional demo practice (Dana Reyes, Illinois). Every row is marked `[Sample]`. It replaces her practice's rows, so only run it before she starts. It only runs when `SUPABASE_PROJECT_REF` names the database: `local` for the built-in one.

## 4. Start the app

1. Run `npm run dev` and leave it running.
2. Open http://localhost:3000. She works in the app from here on; you're done once she sees it.

## 5. Connect Aeon's tools to her agent (MCP)

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

Check it: ask the agent "What needs me this week?" It should call `morning_brief`.

Tools: `morning_brief`, `update_facts`, `answer_setup`, `log_event`, `research_state_rules`, `recheck_rules`, `queue_approval`, `status`. Nothing is sent, posted or booked without her approval in the app.

## 6. Skills

Point her agent at the skills in this repo (or copy them into its skills folder):

- `skills/admin/SKILL.md`: everyday practice admin with the tools above.
- `skills/admin/state-research/SKILL.md`: if her practice is **outside Illinois**, research her state's rules. Muse searches official sites only, code keeps only rules it can verify against what Muse cited, and the rules wait in her inbox until she approves them. Each one then says "please confirm with your board" until she does. Federal and Illinois rules already ship verified.

## 7. Check it worked

- `npm test` passes. It runs on a throwaway built-in database of its own, never on hers.
- The app opens, and the Deadlines page loads.
- The agent answers "What needs me this week?" using `morning_brief`.
