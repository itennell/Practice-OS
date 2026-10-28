// Runs once when the Next server starts, before it serves a request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;

  // No DATABASE_URL (a fresh clone, the desktop app): start the built-in database.
  if (!process.env.DATABASE_URL) {
    const { prepareDatabase } = await import("./lib/local-db");
    await prepareDatabase();
  }

  // Her own Muse key, saved in onboarding or Settings › Connections, when .env has none.
  const { loadMuseKey } = await import("./lib/connect/muse");
  await loadMuseKey();

  // Background jobs that need the database go below this line (never on the Vercel copy).
}
