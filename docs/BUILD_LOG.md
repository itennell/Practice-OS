# Build log

- 2026-10-26: Project scaffold: Next.js App Router with Tailwind v4 and the Caseload design tokens, MCP server with a status tool, empty migrations folder, skills folders, vitest smoke tests, gitleaks pre-commit hook and GitHub Actions check.
- 2026-10-26: Connected the Practice-OS Supabase project through the shared IPv4 pooler (the direct db host is IPv6-only) and confirmed the Meta model API key with the cookbook ping; .env.example now says which pooler to use.
- 2026-10-26: Added lib/meta.ts (one client for all four Meta models, shapes copied from the cookbook at 0a99b98, PDF file shape from Meta's docs) and npm run smoke: chat, tool call, headshot, SAM cut-out, voicemail transcription and PDF intake (file and PNG) all PASS; offline tests replay the saved replies.
- 2026-10-26: First migration (001_init): practice_os schema with 14 tables, RLS on and no policies, public roles revoked, append-only audit_log; npm run db:reset seeds the fictional Dana Reyes practice with 3 pending approvals; model_calls now saved to the database; live-database tests run locally only.
