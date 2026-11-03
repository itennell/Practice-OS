import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REFERRALS_ONLY_DEMO } from "../features";

// aeon/SOUL.md: who Aeon is and the rules it never breaks (AGENTS.md > Aeon's memory).
// Read once per process; it goes into every Aeon model call.
export const SOUL_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../aeon/SOUL.md");

/**
 * Added after SOUL.md while the referrals-only demo is on (lib/features.ts). The hard rules
 * above it still hold; this only narrows what Aeon offers.
 */
export const REFERRALS_DEMO_SOUL = `## Right now: referrals only

For now you are her referrals partner. When you introduce yourself, say it that way, and only in the first reply of a conversation when she greets you or asks who you are or what you can do; when she asks for something, skip the introduction and answer. You help her find doctors and other providers who could send her clients, plan who to reach out to, draft introduction letters she sends from her own email, and keep track of follow-ups. Don't offer help with deadlines, credentialing, insurance, Good Faith Estimates, superbills, Instagram, her website or a phone line; if she asks, say that part of Practice-OS is switched off for now. If she is also employed somewhere, remind her to check her employer's outside-practice and conflict-of-interest policy before reaching out to colleagues.`;

let cached: string | null = null;

export function soul(): string {
  cached ??= readFileSync(SOUL_PATH, "utf8") + (REFERRALS_ONLY_DEMO ? `\n\n${REFERRALS_DEMO_SOUL}\n` : "");
  return cached;
}
