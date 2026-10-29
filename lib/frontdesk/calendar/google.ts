import { GOOGLE_SCOPES } from "../../connect/google-scopes";
import { candidateSlots, DEFAULT_HOURS, overlaps, type Hours } from "./slots";
import { CalendarError, type CalendarAdapter, type CheckResult, type Slot } from "./types";

// Google Calendar API v3 on her primary calendar. The token comes from
// desktop-app's Google sign-in (lib/connect getAccessToken) with only the
// calendar.events and calendar.freebusy scopes. Google has no booking page,
// so open times are her office hours minus what freeBusy says is taken.

export const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_CALENDAR_SCOPES: string[] = [GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.calendarFreebusy];

export type GoogleConfig = { getToken: () => Promise<string>; timeZone: string; hours?: Hours; consultMinutes?: number };

/** A Google event id (lowercase a-v and 0-9) from the reference, so a retried booking never doubles. */
export function googleEventId(reference: string): string {
  return `practiceos${reference.toLowerCase().replace(/[^a-v0-9]/g, "")}${Date.now().toString(32)}`;
}

export function googleAdapter(config: GoogleConfig, fetchImpl: typeof fetch = fetch): CalendarAdapter {
  const hours = config.hours ?? DEFAULT_HOURS;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await config.getToken();
    const res = await fetchImpl(`${GOOGLE_CALENDAR_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new CalendarError(`Google refused the sign-in (${res.status})`, "Google needs you to sign in again. Press Connect Google Calendar.", res.status);
    }
    if (!res.ok) throw new CalendarError(`Google answered HTTP ${res.status}`, "Google Calendar didn't answer. Try again in a minute.", res.status);
    return (res.status === 204 ? {} : await res.json()) as T;
  }

  async function busy(from: Date, to: Date) {
    const out = await call<{ calendars: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }> }>("/freeBusy", {
      method: "POST",
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: config.timeZone, items: [{ id: "primary" }] }),
    });
    const cal = out.calendars.primary;
    if (!cal || cal.errors?.length) throw new CalendarError("freeBusy returned errors", "Google couldn't read your calendar. Press Connect Google Calendar again.");
    return (cal.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  }

  const when = (slot: Slot) => ({
    start: { dateTime: slot.start.toISOString(), timeZone: config.timeZone },
    end: { dateTime: slot.end.toISOString(), timeZone: config.timeZone },
  });

  return {
    provider: "google",

    async check(): Promise<CheckResult> {
      try {
        const now = new Date();
        await busy(now, new Date(now.getTime() + 3_600_000));
        return { ok: true, label: "Connected: Google Calendar (primary)" };
      } catch (e) {
        return { ok: false, fix: e instanceof CalendarError ? e.fix : "Couldn't reach Google Calendar. Check your internet, then try again." };
      }
    },

    async openSlots(from: Date, to: Date) {
      const taken = await busy(from, to);
      return candidateSlots(from, to, hours, config.timeZone, config.consultMinutes).filter((s) => !overlaps(s, taken));
    },

    async isFree(slot: Slot) {
      return !overlaps(slot, await busy(slot.start, slot.end));
    },

    async book(slot: Slot, reference: string) {
      const out = await call<{ id: string }>("/calendars/primary/events", {
        method: "POST",
        // Only the reference reaches Google; the caller's details stay in Practice-OS.
        body: JSON.stringify({ id: googleEventId(reference), summary: `Phone consult ${reference}`, ...when(slot) }),
      });
      return { externalId: out.id };
    },

    async reschedule(externalId: string, slot: Slot) {
      await call(`/calendars/primary/events/${encodeURIComponent(externalId)}`, { method: "PATCH", body: JSON.stringify(when(slot)) });
      return { externalId };
    },

    async cancel(externalId: string) {
      await call(`/calendars/primary/events/${encodeURIComponent(externalId)}`, { method: "DELETE" });
    },
  };
}
