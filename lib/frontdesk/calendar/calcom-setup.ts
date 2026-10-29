import { calcomCall, CALCOM_VERSIONS as V, type CalcomEventType } from "./calcom";
import { CalendarError, type Slot } from "./types";

// Connect Cal.com in one paste (Cal.com API v2, docs read 2026-10-28):
//   GET  /v2/me                   her time zone (no cal-api-version documented)
//   GET  /v2/schedules/default    her hours (cal-api-version 2024-06-11)
//   GET  /v2/event-types          find the consult (2026-06-12)
//   POST /v2/event-types          or make it (2026-06-12)
//   GET  /v2/slots                the next open time (2024-09-04)
// Safe to run twice: it lists before it creates, and a taken slug means it
// already exists. Only the reference ever reaches a booking; this event's
// location is the attendee's phone, which Front Desk never fills in.

export const CONSULT_TITLE = "Free 15-minute consultation";
export const CONSULT_SLUG = "free-15-minute-consultation";
export const CONSULT_DESCRIPTION =
  "A free 15-minute phone call about scheduling, fees and whether the practice is a good fit. The practice calls you at the time you pick.";

type Me = { timeZone?: string | null; defaultScheduleId?: number | null; email?: string };
type Schedule = { timeZone?: string; availability?: Array<{ days: string[]; startTime: string; endTime: string }> } | null;

export type AutoConnectResult =
  | { ok: true; eventType: CalcomEventType; created: boolean; timeZone: string; nextSlot: Slot | null }
  | { ok: false; fix: string };

/** A 15-minute event whose title or slug says consult, preferring the one already saved and ours. */
export function pickConsult(types: CalcomEventType[], savedId?: number | null): CalcomEventType | null {
  const saved = savedId ? types.find((t) => t.id === savedId) : undefined;
  if (saved) return saved;
  const ours = types.find((t) => t.slug === CONSULT_SLUG);
  if (ours) return ours;
  return types.find((t) => t.lengthInMinutes === 15 && /consult/i.test(`${t.title} ${t.slug}`)) ?? null;
}

const asList = (data: unknown): CalcomEventType[] => (Array.isArray(data) ? data : data ? [data] : []) as CalcomEventType[];

export async function autoConnectCalcom(
  rawKey: string,
  opts: { savedEventTypeId?: number | null; now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<AutoConnectResult> {
  const key = rawKey.trim();
  if (!/^cal_\S{10,}$/.test(key)) return { ok: false, fix: "That doesn't look like a Cal.com key. It starts with cal_. Copy it again from Cal.com." };
  const f = opts.fetchImpl ?? fetch;
  try {
    const me = await calcomCall<Me>(key, null, "/me", {}, f);
    const schedule = await calcomCall<Schedule>(key, V.schedules, "/schedules/default", {}, f);
    if (!schedule?.availability?.length) {
      return { ok: false, fix: "Cal.com doesn't know your hours yet. In Cal.com, open Availability and set your hours. Then paste your key here again." };
    }
    const timeZone = me.timeZone || schedule.timeZone || "America/Chicago";

    let eventType = pickConsult(asList(await calcomCall<unknown>(key, V.eventTypes, "/event-types", {}, f)), opts.savedEventTypeId);
    let created = false;
    if (!eventType) {
      try {
        eventType = await calcomCall<CalcomEventType>(
          key,
          V.eventTypes,
          "/event-types",
          {
            method: "POST",
            body: JSON.stringify({
              title: CONSULT_TITLE,
              slug: CONSULT_SLUG,
              lengthInMinutes: 15,
              description: CONSULT_DESCRIPTION,
              locations: [{ type: "attendeePhone" }],
            }),
          },
          f,
        );
        created = true;
      } catch (e) {
        // A taken slug means a first try already made it: use that one.
        eventType = pickConsult(asList(await calcomCall<unknown>(key, V.eventTypes, "/event-types", {}, f).catch(() => [])));
        if (!eventType) {
          if (e instanceof CalendarError && e.status === 401) throw e;
          return {
            ok: false,
            fix: `Cal.com wouldn't add the consult for you. In Cal.com, add a 15-minute event named "${CONSULT_TITLE}". Then paste your key here again.`,
          };
        }
      }
    }

    const now = opts.now ?? new Date();
    const q = new URLSearchParams({
      eventTypeId: String(eventType.id),
      start: now.toISOString(),
      end: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
      timeZone,
      format: "range",
    });
    const byDay = await calcomCall<Record<string, Array<{ start: string; end?: string }>>>(key, V.slots, `/slots?${q}`, {}, f);
    const first = Object.values(byDay ?? {})
      .flat()
      .map((s) => ({ start: new Date(s.start), end: new Date(s.end ?? s.start) }))
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    return { ok: true, eventType, created, timeZone, nextSlot: first ?? null };
  } catch (e) {
    return { ok: false, fix: e instanceof CalendarError ? e.fix : "Couldn't reach Cal.com. Check your internet, then paste your key again." };
  }
}
