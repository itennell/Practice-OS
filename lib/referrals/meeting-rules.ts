// Small meeting rules shared by the calendar page (client) and lib/referrals/meetings.ts
// (server), so the button and the server agree. Pure: no database.

export const NOT_YET = "That meeting hasn't started yet. Mark it done after it happens.";

/** Done means it happened: only once its start has passed. */
export function canMarkDone(startsAt: string | Date, now: Date = new Date()): boolean {
  const t = startsAt instanceof Date ? startsAt.getTime() : Date.parse(startsAt);
  return Number.isFinite(t) && t <= now.getTime();
}
