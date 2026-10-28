import { db } from "../db";
import { calendarStatus, phoneStatus } from "./connect";

// Front Desk for Aeon's chat and MCP: counts, statuses and ids only. No caller
// names, numbers or words reach the model (no BAA yet).
export async function frontDeskSummary() {
  const [counts] = await db()`
    select count(*) filter (where status = 'new')::int as new,
           count(*) filter (where status = 'needs_clinician')::int as needs_you,
           count(*) filter (where status = 'options_sent')::int as waiting_on_caller,
           count(*) filter (where status = 'booked')::int as booked,
           count(*) filter (where created_at > date_trunc('day', now()))::int as today
    from practice_os.inquiries where not is_sample`;
  const [alerts] = await db()`
    select count(*) filter (where kind = 'crisis')::int as urgent, count(*) filter (where kind <> 'crisis')::int as other
    from practice_os.alerts where acknowledged_at is null and not is_sample`;
  const consults = await db()`
    select reference, starts_at from practice_os.consult_bookings
    where status in ('booked', 'rescheduled') and starts_at > now() and not is_sample order by starts_at limit 10`;
  const open = await db()`
    select id, channel, status, created_at from practice_os.inquiries
    where status <> 'closed' and not is_sample order by created_at desc limit 20`;
  const [phone, calendar] = await Promise.all([phoneStatus(), calendarStatus()]);
  return {
    counts,
    urgent_alerts: alerts.urgent,
    other_alerts: alerts.other,
    upcoming_consults: consults.map((c) => ({ reference: c.reference, starts_at: new Date(c.starts_at).toISOString() })),
    open_inquiries: open.map((i) => ({ id: i.id, channel: i.channel, status: i.status, received_at: new Date(i.created_at).toISOString() })),
    phone: { connected: phone.connected, ok: phone.check?.ok ?? false, fix: phone.check && !phone.check.ok ? phone.check.fix : null },
    calendar: { provider: calendar.provider, connected: calendar.connected, ok: calendar.check?.ok ?? false, fix: calendar.check && !calendar.check.ok ? calendar.check.fix : null },
    note: "Callers' names, numbers and messages are on the Front Desk page only.",
  };
}
