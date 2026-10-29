import { getConnection } from "../../connections";
import { db } from "../../db";
import { calcomAdapter } from "./calcom";
import { GOOGLE_CALENDAR_SCOPES } from "./google";
import { DEFAULT_HOURS, type Hours } from "./slots";
import type { CalendarAdapter, CalendarProvider } from "./types";

export * from "./types";
export { GOOGLE_CALENDAR_SCOPES };

// Cal.com connection row (provider 'calcom'): the API key is the encrypted
// access token; meta names her consult event type.
export type CalcomMeta = { eventTypeId: number; eventTypeLabel?: string; ownerEmail?: string };

export async function calendarSettings(): Promise<{ provider: CalendarProvider | null; timeZone: string; hours: Hours; consultMinutes: number }> {
  const [row] = await db()`
    select s.front_desk_calendar, s.timezone, s.front_desk_consult_minutes, p.office_hours
    from practice_os.settings s left join practice_os.clinician_profile p on true limit 1`.catch(() => []);
  const weekdays = Array.isArray(row?.office_hours?.weekdays) ? (row.office_hours.weekdays as number[]) : DEFAULT_HOURS.weekdays;
  return {
    provider: row?.front_desk_calendar === "calcom" || row?.front_desk_calendar === "google" ? row.front_desk_calendar : null,
    timeZone: typeof row?.timezone === "string" ? row.timezone : "America/Chicago",
    hours: { ...DEFAULT_HOURS, weekdays },
    consultMinutes: typeof row?.front_desk_consult_minutes === "number" ? row.front_desk_consult_minutes : 15,
  };
}

/** The calendar she picked, or null when none is connected. */
export async function getCalendarAdapter(): Promise<CalendarAdapter | null> {
  const s = await calendarSettings();
  // Google Calendar (./google.ts with lib/connect getAccessToken) comes back after the hackathon.
  // Cal.com is the only calendar for now: a saved Cal.com connection counts even
  // before she picks, and a saved "google" choice means Cal.com until Google returns.
  if (s.provider === "calcom" || s.provider === null || s.provider === "google") {
    const conn = await getConnection("calcom").catch(() => null);
    const meta = conn?.meta as Partial<CalcomMeta> | undefined;
    if (!conn?.accessToken || typeof meta?.eventTypeId !== "number") return null;
    return calcomAdapter({ apiKey: conn.accessToken, eventTypeId: meta.eventTypeId, timeZone: s.timeZone, ownerEmail: meta.ownerEmail });
  }
  return null;
}
