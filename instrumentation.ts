// Runs once when the Next server starts, before it serves a request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;

  // The Vercel copy always uses the shared database; it never starts a built-in one.
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required on Vercel. Add it in the Vercel project's environment variables.");
  }

  // No DATABASE_URL (a fresh clone, the desktop app): start the built-in database.
  if (!process.env.DATABASE_URL) {
    const { prepareDatabase } = await import("./lib/local-db");
    await prepareDatabase();
  }

  // Her own Muse key, saved in onboarding or Settings › Connections, when .env has none.
  const { loadMuseKey } = await import("./lib/connect/muse");
  await loadMuseKey();

  // Background jobs that need the database go below this line (never on the Vercel copy).

  // Front Desk (lib/frontdesk/poller.ts): check her phone company every minute
  // while the app is open. Off on Vercel and when FRONT_DESK_POLL=off.
  if (!process.env.VERCEL) {
    const { startFrontDeskPoller } = await import("./lib/frontdesk/poller");
    startFrontDeskPoller(); // starts a timer and returns; never awaited
  }
}
