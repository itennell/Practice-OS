// Cal.com API v2 responses for the one-paste Connect (lib/frontdesk/calendar/calcom-setup.ts).
// slots: the real response from Isaiah's spike run on 2026-10-28 (scripts/spike-calcom.ts,
// event 7685541, America/Chicago), body only. The rest are shaped from Cal.com's reference
// pages (/v2/me, /v2/schedules/default, /v2/event-types list and create), fake data only.
import { spikeSlots } from "./calcom-spike-slots";

export { spikeSlots };

export const me = {
  status: "success",
  data: { id: 1, username: "sample-dana", email: "dana@example.com", timeZone: "America/Chicago", defaultScheduleId: 254, timeFormat: 12, weekStart: "Sunday" },
};

export const schedule = {
  status: "success",
  data: {
    id: 254,
    name: "Working hours",
    timeZone: "America/Chicago",
    isDefault: true,
    availability: [{ days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], startTime: "09:00", endTime: "17:00" }],
    overrides: [],
  },
};

export const noSchedule = { status: "success", data: null };

const type = (id: number, title: string, slug: string, lengthInMinutes: number) => ({
  id,
  title,
  slug,
  lengthInMinutes,
  description: "",
  locations: [],
  hidden: false,
  bookingFields: [],
});

/** Isaiah's real event type (id and slug from his account; the rest doc-shaped). */
export const isaiahConsult = type(7685541, "Free 15-Minute Consultation", "consult", 15);
/** Isaiah's 7685541 as a read-only GET returned it on 2026-10-29 (2026-06-12 shape, trimmed). */
export const isaiahConsultLive = {
  ...isaiahConsult,
  locations: [{ type: "attendeePhone" }],
  bookingFields: [
    { field: "name", slug: "name" },
    { field: "email", slug: "email", required: true, hidden: false },
    { field: "attendeePhoneNumber", slug: "attendeePhoneNumber", required: false, hidden: true },
    { field: "location", slug: "location" },
    { field: "title", slug: "title", required: true, hidden: true },
    { field: "notes", slug: "notes", required: false, hidden: false },
  ],
};
/** The same event after she changes the location as the fix says. */
export const isaiahConsultFixed = { ...isaiahConsultLive, locations: [{ type: "address", address: "By phone: the practice calls you", public: true }] };
export const intro30 = type(9001, "[Sample] Intro call", "intro", 30);
export const consult30 = type(9002, "[Sample] Consultation", "consultation", 30);
export const ours = type(9003, "Free 15-minute consultation", "free-15-minute-consultation", 15);

export const list = (...types: unknown[]) => ({ status: "success", data: types });
export const created = { status: "success", data: ours };
export const slugTaken = { status: "error", error: { code: "BadRequestException", message: "Event type with this slug already exists" } };
export const forbidden = { status: "error", error: { code: "ForbiddenException", message: "Forbidden" } };
export const noSlots = { status: "success", data: {} };
