import { CalendarError, type CalendarAdapter, type CheckResult, type Slot } from "./types";

// Cal.com API v2 (cal.com/docs/api-reference/v2), the clinician's own account.
// She pastes an API key (Settings > Developer > API keys); calcom-setup.ts finds
// or makes her consult event type. Each endpoint pins its cal-api-version, as
// the docs require ("Not passing the correct value will default to an older version").

export const CALCOM_API = "https://api.cal.com/v2";
export const CALCOM_VERSIONS = { eventTypes: "2026-06-12", schedules: "2024-06-11", slots: "2024-09-04", bookings: "2026-02-25" } as const;
const V = CALCOM_VERSIONS;

/** Cal.com's API, or a local fixture server in end-to-end tests (CALCOM_API_BASE, http://127.0.0.1 only). */
export function calcomBase(): string {
  const test = process.env.CALCOM_API_BASE;
  return test && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(test) ? test : CALCOM_API;
}

export type CalcomConfig = { apiKey: string; eventTypeId: number; timeZone: string };
export type CalcomEventType = { id: number; title: string; slug: string; lengthInMinutes: number };

type Envelope<T> = { status: string; data: T };

export async function calcomCall<T>(apiKey: string, version: string | null, path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${calcomBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(version ? { "cal-api-version": version } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401) {
    throw new CalendarError(`Cal.com refused the key (${res.status})`, "That key didn't work. Copy it again from Cal.com and paste all of it.", res.status);
  }
  if (res.status === 403) throw new CalendarError("Cal.com said no (403)", "Cal.com didn't allow that with this key. Make a new key in Cal.com and paste it again.", 403);
  if (!res.ok) throw new CalendarError(`Cal.com answered HTTP ${res.status}`, "Cal.com didn't answer. Try again in a minute.", res.status);
  return ((await res.json()) as Envelope<T>).data;
}

/** Her event types, for the Connect card's picker. */
export function listCalcomEventTypes(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<CalcomEventType[]> {
  return calcomCall<CalcomEventType[]>(apiKey, V.eventTypes, "/event-types", {}, fetchImpl);
}

export function calcomAdapter(config: CalcomConfig, fetchImpl: typeof fetch = fetch): CalendarAdapter {
  const call = <T>(version: string, path: string, init: RequestInit = {}) => calcomCall<T>(config.apiKey, version, path, init, fetchImpl);

  async function slotsBetween(from: Date, to: Date): Promise<Slot[]> {
    const q = new URLSearchParams({
      eventTypeId: String(config.eventTypeId),
      start: from.toISOString(),
      end: to.toISOString(),
      timeZone: config.timeZone,
      format: "range",
    });
    const byDay = await call<Record<string, Array<{ start: string; end?: string }>>>(V.slots, `/slots?${q}`);
    return Object.values(byDay)
      .flat()
      .map((s) => ({ start: new Date(s.start), end: new Date(s.end ?? s.start) }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  return {
    provider: "calcom",

    async check(): Promise<CheckResult> {
      try {
        const types = await listCalcomEventTypes(config.apiKey, fetchImpl);
        const t = types.find((e) => e.id === config.eventTypeId);
        if (!t) return { ok: false, fix: "That consult event type isn't on your Cal.com account any more. Pick it again." };
        return { ok: true, label: `Connected: ${t.title} (${t.lengthInMinutes} min, Cal.com)` };
      } catch (e) {
        return { ok: false, fix: e instanceof CalendarError ? e.fix : "Couldn't reach Cal.com. Check your internet, then try again." };
      }
    },

    openSlots: slotsBetween,

    async isFree(slot: Slot) {
      const around = await slotsBetween(new Date(slot.start.getTime() - 60_000), new Date(slot.end.getTime() + 60_000));
      return around.some((s) => s.start.getTime() === slot.start.getTime());
    },

    async book(slot: Slot, reference: string) {
      const out = await call<{ uid: string }>(V.bookings, "/bookings", {
        method: "POST",
        body: JSON.stringify({
          start: slot.start.toISOString(),
          eventTypeId: config.eventTypeId,
          // Only the reference reaches Cal.com; the caller's details stay in Practice-OS.
          attendee: { name: `Phone consult ${reference}`, timeZone: config.timeZone, language: "en" },
          metadata: { reference, source: "practice-os-front-desk" },
        }),
      });
      return { externalId: out.uid };
    },

    async reschedule(externalId: string, slot: Slot) {
      const out = await call<{ uid: string }>(V.bookings, `/bookings/${encodeURIComponent(externalId)}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ start: slot.start.toISOString(), reschedulingReason: "Moved by text" }),
      });
      return { externalId: out.uid ?? externalId };
    },

    async cancel(externalId: string) {
      await call(V.bookings, `/bookings/${encodeURIComponent(externalId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ cancellationReason: "Cancelled by text" }),
      });
    },
  };
}
