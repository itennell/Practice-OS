import { checkFrontDesk } from "./check";

// Front Desk checks her phone company every minute while the app is open
// (desktop plan: the provider hosts the greeting and voicemail; we list).
// Never on Vercel, where functions don't stay running.

export const POLL_MS = 60_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

export function startFrontDeskPoller(): void {
  if (timer || process.env.VERCEL || process.env.FRONT_DESK_POLL === "off") return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await checkFrontDesk();
    } catch (e) {
      console.error("[front-desk] check failed:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  setTimeout(tick, 5_000).unref?.();
}

export function stopFrontDeskPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
