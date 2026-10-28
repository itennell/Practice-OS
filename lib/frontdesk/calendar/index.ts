import { getConnection } from "../../connections";
import { db } from "../../db";
import { calcomAdapter } from "./calcom";
import { GOOGLE_CALENDAR_SCOPES, googleAdapter } from "./google";
import { DEFAULT_HOURS, type Hours } from "./slots";
import { CalendarError, type CalendarAdapter, type CalendarProvider } from "./types";

export * from "./types";
export { GOOGLE_CALENDAR_SCOPES };

// Cal.com connection row (provider 'calcom'): the API key is the encrypted
// access token; meta names her consult event type.
export type CalcomMeta = { eventTypeId: number; eventTypeLabel?: string };

export async function calendarSettings(): Promise<{ provider: CalendarProvider | null; timeZone: string; hours: Hours }> {
  const [row] = await db()`
    select s.front_desk_calendar, s.timezone, p.office_hours
    from practice_os.settings s left join practice_os.clinician_profile p on true limit 1`.catch(() => []);
  const weekdays = Array.isArray(row?.office_hours?.weekdays) ? (row.office_hours.weekdays as number[]) : DEFAULT_HOURS.weekdays;
  return {
    provider: row?.front_desk_calendar === "calcom" || row?.front_desk_calendar === "google" ? row.front_desk_calendar : null,
    timeZone: typeof row?.timezone === "string" ? row.timezone : "America/Chicago",
    hours: { ...DEFAULT_HOURS, weekdays },
  };
}

// desktop-app's lib/connect owns the Google sign-in and refresh. Until that
// lands on main this throws a plain fix; the import replaces it at rebase.
async function googleToken(): Promise<string> {
  void GOOGLE_CALENDAR_SCOPES;
  throw new CalendarError("Google sign-in not installed", "Google Calendar arrives with the desktop app update. Use Cal.com for now.");
}

/** The calendar she picked, or null when none is connected. */
export async function getCalendarAdapter(): Promise<CalendarAdapter | null> {
  const s = await calendarSettings();
  if (s.provider === "google") return googleAdapter({ getToken: googleToken, timeZone: s.timeZone, hours: s.hours });
  if (s.provider === "calcom") {
    const conn = await getConnection("calcom").catch(() => null);
    const meta = conn?.meta as Partial<CalcomMeta> | undefined;
    if (!conn?.accessToken || typeof meta?.eventTypeId !== "number") return null;
    return calcomAdapter({ apiKey: conn.accessToken, eventTypeId: meta.eventTypeId, timeZone: s.timeZone });
  }
  return null;
}
