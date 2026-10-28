// Spike: Cal.com API v2. Find the "Free 15-minute consultation" event type and list
// the next five open slots. Read-only: nothing is booked.
//
// Run: npx tsx scripts/spike-calcom.ts
//
// Docs used (read 2026-10-28):
// - Slots: https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type
//   GET /v2/slots, header cal-api-version: 2024-09-04 (else an older version is used),
//   query start/end (UTC ISO 8601), eventTypeId OR eventTypeSlug+username, timeZone, format.
//   Response: { status, data: { "YYYY-MM-DD": [{ start }] } }.
// - Event types: https://cal.com/docs/api-reference/v2/event-types/list-event-types
//   GET /v2/event-types, header cal-api-version: 2026-06-12, Authorization: Bearer cal_...
//   query username / eventSlug. Hidden event types only show when listing your own.
//   (The older page https://cal.com/docs/api-reference/v2/event-types/get-all-event-types
//   still documents 2024-06-14 for the same endpoint.)
// - Auth: Authorization: Bearer <cal_ API key>.
import { call, requireEnv, saveFixture } from "./spike-lib";

const BASE = "https://api.cal.com/v2";
const SLOTS_VERSION = "2024-09-04";
const EVENT_TYPES_VERSION = "2026-06-12";
const TITLE = "Free 15-minute consultation";

const env = requireEnv("spike-calcom", ["CALCOM_API_KEY"]);
const auth = { Authorization: `Bearer ${env.CALCOM_API_KEY}` };
const username = process.env.CALCOM_USERNAME;
const slug = process.env.CALCOM_EVENT_SLUG;
const timeZone = process.env.CALCOM_TIME_ZONE || "America/Chicago";

let eventTypeId = process.env.CALCOM_EVENT_TYPE_ID;
let ok = false;

try {
  if (!eventTypeId) {
    // Find the consult event type among this account's event types.
    const q = new URLSearchParams();
    if (username) q.set("username", username);
    if (username && slug) q.set("eventSlug", slug);
    const list = await call("GET", `${BASE}/event-types${q.size ? `?${q}` : ""}`, {
      headers: { ...auth, "cal-api-version": EVENT_TYPES_VERSION },
    });
    const data = (list.body as { data?: unknown })?.data;
    const types = (Array.isArray(data) ? data : data ? [data] : []) as { id: number; title: string; slug: string }[];
    const match =
      types.find((t) => t.title?.trim().toLowerCase() === TITLE.toLowerCase()) ??
      (slug ? types.find((t) => t.slug === slug) : undefined);
    if (!match) {
      console.error(`\nNo event type titled "${TITLE}"${slug ? ` or with slug "${slug}"` : ""}.`);
      console.error(`Found: ${types.map((t) => `"${t.title}" (id ${t.id}, slug ${t.slug})`).join(", ") || "none"}`);
      await saveFixture("calcom", false);
      process.exit(1);
    }
    eventTypeId = String(match.id);
    console.log(`\nUsing event type ${match.id}: "${match.title}" (slug ${match.slug}). Put CALCOM_EVENT_TYPE_ID=${match.id} in .env to skip this lookup.`);
  }

  // Look 14 days ahead; the first five slots are what a caller would be offered.
  const start = new Date();
  const end = new Date(start.getTime() + 14 * 24 * 3600 * 1000);
  const q = new URLSearchParams({
    eventTypeId,
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone,
    format: "range",
  });
  const res = await call("GET", `${BASE}/slots?${q}`, {
    headers: { ...auth, "cal-api-version": SLOTS_VERSION },
  });
  const byDay = ((res.body as { data?: Record<string, { start: string; end?: string }[]> })?.data ?? {});
  const slots = Object.values(byDay).flat().slice(0, 5);
  ok = res.status === 200;
  console.log(`\nNext ${slots.length} open slots (${timeZone}):`);
  for (const s of slots) console.log(`  ${s.start}${s.end ? ` to ${s.end}` : ""}`);
  if (ok && !slots.length) console.log("  none in the next 14 days (check the event type's availability schedule)");
  await saveFixture("calcom", ok, { next_five: slots });
} catch (err) {
  console.error(`\nspike-calcom failed: ${(err as Error).message}`);
  await saveFixture("calcom", false);
  process.exit(1);
}
process.exit(ok ? 0 : 1);
