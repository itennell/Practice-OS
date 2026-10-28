// Runs once when the Next server starts, before it serves a request. With no
// DATABASE_URL (a fresh clone, the desktop app) this starts the built-in
// database; with DATABASE_URL set it does nothing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.DATABASE_URL) return;
  const { prepareDatabase } = await import("./lib/local-db");
  await prepareDatabase();
}
