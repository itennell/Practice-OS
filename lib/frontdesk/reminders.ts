import { queueApproval } from "../approvals";
import { withOrigin } from "../approval-policy";
import { loadApprovalSettings } from "../approval-settings";
import { db } from "../db";
import { localDate, whenLabel } from "./calendar/zone";
import { deps } from "./deps";
import { prettyPhone } from "./phone/numbers";
import { isOptedOut, practice, type BookingRow } from "./store";
import { reminderText } from "./templates";

// The day-before reminder, sent from 9 am in her time zone, once per booking.
// It goes out as an sms_reply approval that runs on its own only when her
// "Text a reminder the day before" switch is on.

export const REMINDER_HOUR = 9;

export async function queueReminders(): Promise<number> {
  const { frontDesk } = await loadApprovalSettings();
  if (!frontDesk.send_reminders) return 0;
  const tz = await deps().timeZone();
  const now = deps().now();
  const today = localDate(now, tz);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < REMINDER_HOUR) return 0;

  const rows = await db()<BookingRow[]>`
    select * from practice_os.consult_bookings
    where status in ('booked', 'rescheduled') and reminder_sent_at is null and not is_sample
      and contact_phone is not null
      and starts_at between ${new Date(now.getTime() + 6 * 3_600_000)} and ${new Date(now.getTime() + 48 * 3_600_000)}`;
  const p = await practice();
  let queued = 0;
  for (const b of rows) {
    const d = localDate(b.starts_at, tz);
    const tomorrow = localDate(new Date(Date.UTC(today.year, today.month - 1, today.day + 1, 12)), "UTC");
    if (d.year !== tomorrow.year || d.month !== tomorrow.month || d.day !== tomorrow.day) continue;
    if (!b.contact_phone || (await isOptedOut(b.contact_phone))) continue;
    // Claim it first so two checks never remind twice.
    const claimed = await db()`
      update practice_os.consult_bookings set reminder_sent_at = now()
      where id = ${b.id} and reminder_sent_at is null returning id`;
    if (!claimed.length) continue;
    const body = reminderText(p, whenLabel(b.starts_at, tz), b.reference ?? "");
    // Reminders follow their own switch, so that switch stands in for text_missed_callers here.
    await withOrigin({ rule: "front_desk", rules: { ...frontDesk, text_missed_callers: frontDesk.send_reminders } }, () =>
      queueApproval({
        kind: "sms_reply",
        title: `Remind ${b.contact_name ?? prettyPhone(b.contact_phone!)} about tomorrow's consult`,
        preview: { to: prettyPhone(b.contact_phone!), text: body },
        payload: { inquiry_id: b.inquiry_id, booking_id: b.id, to: b.contact_phone, body, purpose: "reminder" },
        createdBy: "front_desk",
      }),
    );
    queued++;
  }
  return queued;
}
