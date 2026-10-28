// Limits for the public Vercel demo copy (AGENTS.md > Vercel copy; Isaiah's
// decision 2026-10-27: chat open to anyone with DEMO_PASSWORD). Viewers can
// chat and draft, but only ADMIN_PASSWORD can change saved data, and chat
// model calls are capped per day so visitors can't run up the bill.
import { canDecide } from "../admin-guard";
import { db } from "../db";
import { FEATURE } from "./agent";

export const DEMO_DAILY_CHAT_CALLS = 300;

export const DEMO_RESTING =
  "The demo has had a busy day and is resting until tomorrow. On her own computer there is no limit.";

/** True on the Vercel copy without the admin password: tools that change data refuse. */
export function isViewOnly(request: Request): boolean {
  return Boolean(process.env.VERCEL) && !canDecide(request);
}

/** On the Vercel copy, whether today's chat model calls have reached the cap. Never limits a local install. */
export async function demoCapReached(): Promise<boolean> {
  if (!process.env.VERCEL) return false;
  const [{ n }] = await db()<{ n: number }[]>`
    select count(*)::int as n from practice_os.model_calls
    where feature = ${FEATURE} and at > now() - interval '1 day'`;
  return n >= DEMO_DAILY_CHAT_CALLS;
}
