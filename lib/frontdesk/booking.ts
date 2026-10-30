import { withOrigin } from "../approval-policy";
import { loadApprovalSettings } from "../approval-settings";
import { audit } from "../audit";
import { db } from "../db";
import { isDryRun } from "../env";
import { whenLabel } from "./calendar/zone";
import { deps } from "./deps";
import { offerTimes } from "./offers";
import { getInquiry, nextReference, practice, sendText, type BookingRow, type OfferRow } from "./store";
import { bookedText, cancelledText, rescheduledText, slotTakenText } from "./templates";

// What the consult_booking, consult_reschedule and consult_cancel executors do.
// The time is re-checked right before booking; if it's gone, a fresh offer goes out.
// A [Sample] (the test console) never touches her real calendar: it is booked,
// moved and cancelled as a dry run, whatever DRY_RUN says.

async function loadOffer(id: unknown): Promise<OfferRow> {
  if (typeof id !== "string") throw new Error("payload.offer_id is missing.");
  const [row] = await db()<OfferRow[]>`select * from practice_os.consult_offers where id = ${id}`;
  if (!row) throw new Error("That offer no longer exists.");
  return row;
}

function chosenSlot(offer: OfferRow, index: unknown) {
  const i = typeof index === "number" ? index : Number(index);
  const s = offer.slots[i - 1];
  if (!s) throw new Error(`The offer has no time number ${index}.`);
  return { start: new Date(s.start), end: new Date(s.end), index: i };
}

async function reofferAfterTaken(offer: OfferRow, approvalId: string, to: string) {
  await db()`update practice_os.consult_offers set status = 'expired' where id = ${offer.id}`;
  await sendText({ to, body: slotTakenText(await practice()), inquiryId: offer.inquiry_id, actor: "executor", action: "slot_taken_sent", approvalId });
  const { frontDesk } = await loadApprovalSettings();
  const next = await withOrigin({ rule: "front_desk", rules: frontDesk }, () =>
    offerTimes(offer.inquiry_id, { purpose: offer.purpose, bookingId: offer.booking_id }),
  );
  return { taken: true, reoffer: next.outcome };
}

export async function bookFromOffer(approvalId: string, payload: Record<string, unknown>) {
  const offer = await loadOffer(payload.offer_id);
  const slot = chosenSlot(offer, payload.index);
  const inquiry = await getInquiry(offer.inquiry_id);
  if (!inquiry?.contact_phone) throw new Error("The caller has no number to confirm with.");
  const sample = Boolean(inquiry.is_sample || offer.is_sample);
  const dryRun = isDryRun() || sample;
  // A [Sample] reads no calendar at all, so nothing on hers is checked, held or booked.
  const cal = sample ? null : await deps().calendar();
  if (!cal && !sample) throw new Error("No calendar is connected. Connect Cal.com or Google Calendar on the Front Desk page.");

  if (cal && !(await cal.isFree(slot))) return reofferAfterTaken(offer, approvalId, inquiry.contact_phone);

  const reference = await nextReference();
  const externalId = dryRun || !cal ? `dry-run-${reference}` : (await cal.book(slot, reference)).externalId;
  const [booking] = await db()<BookingRow[]>`
    insert into practice_os.consult_bookings
      (inquiry_id, calendar_provider, external_id, reference, starts_at, ends_at, status, contact_name, contact_phone, is_sample)
    values (${inquiry.id}, ${cal?.provider ?? null}, ${externalId}, ${reference}, ${slot.start}, ${slot.end}, 'booked',
            ${inquiry.contact_name}, ${inquiry.contact_phone}, ${sample})
    returning *`;
  await db()`update practice_os.consult_offers set status = 'chosen', chosen_index = ${slot.index} where id = ${offer.id}`;
  await db()`update practice_os.inquiries set status = 'booked' where id = ${inquiry.id}`;
  await audit({ actor: "executor", action: "consult_booked", approvalId, subjectType: "consult_booking", subjectId: booking.id, details: { reference, calendar: cal?.provider ?? null, dryRun, sample } });

  const label = whenLabel(slot.start, await deps().timeZone());
  await sendText({ to: inquiry.contact_phone, body: bookedText(await practice(), label, reference), inquiryId: inquiry.id, actor: "executor", action: "booking_confirmation_sent", approvalId });
  return { booked: reference, starts_at: slot.start.toISOString(), calendar: cal?.provider ?? null, dryRun };
}

export async function rescheduleFromOffer(approvalId: string, payload: Record<string, unknown>) {
  const offer = await loadOffer(payload.offer_id);
  const slot = chosenSlot(offer, payload.index);
  const [booking] = await db()<BookingRow[]>`select * from practice_os.consult_bookings where id = ${offer.booking_id}`;
  if (!booking?.contact_phone || !booking.external_id) throw new Error("The consult to move wasn't found.");
  const sample = Boolean(booking.is_sample || offer.is_sample);
  const cal = sample ? null : await deps().calendar();
  if (!cal && !sample) throw new Error("No calendar is connected.");

  if (cal && !(await cal.isFree(slot))) return reofferAfterTaken(offer, approvalId, booking.contact_phone);

  const externalId = isDryRun() || !cal ? booking.external_id : (await cal.reschedule(booking.external_id, slot)).externalId;
  await db()`
    update practice_os.consult_bookings
    set starts_at = ${slot.start}, ends_at = ${slot.end}, status = 'rescheduled', external_id = ${externalId}, reminder_sent_at = null
    where id = ${booking.id}`;
  await db()`update practice_os.consult_offers set status = 'chosen', chosen_index = ${slot.index} where id = ${offer.id}`;
  await db()`update practice_os.inquiries set status = 'booked' where id = ${offer.inquiry_id}`;
  await audit({ actor: "executor", action: "consult_rescheduled", approvalId, subjectType: "consult_booking", subjectId: booking.id, details: { reference: booking.reference, dryRun: isDryRun() || sample, sample } });

  const label = whenLabel(slot.start, await deps().timeZone());
  await sendText({ to: booking.contact_phone, body: rescheduledText(await practice(), label, booking.reference ?? ""), inquiryId: offer.inquiry_id, actor: "executor", action: "reschedule_confirmation_sent", approvalId });
  return { rescheduled: booking.reference, starts_at: slot.start.toISOString() };
}

export async function cancelBooking(approvalId: string, payload: Record<string, unknown>) {
  if (typeof payload.booking_id !== "string") throw new Error("payload.booking_id is missing.");
  const [booking] = await db()<BookingRow[]>`select * from practice_os.consult_bookings where id = ${payload.booking_id}`;
  if (!booking) throw new Error("That consult wasn't found.");
  if (booking.status === "cancelled") return { cancelled: booking.reference, already: true };
  if (booking.external_id && !isDryRun() && !booking.is_sample) {
    const cal = await deps().calendar();
    if (!cal || cal.provider !== booking.calendar_provider) throw new Error("The calendar this consult is on isn't connected.");
    await cal.cancel(booking.external_id);
  }
  await db()`update practice_os.consult_bookings set status = 'cancelled' where id = ${booking.id}`;
  if (booking.inquiry_id) await db()`update practice_os.inquiries set status = 'closed' where id = ${booking.inquiry_id}`;
  await audit({ actor: "executor", action: "consult_cancelled", approvalId, subjectType: "consult_booking", subjectId: booking.id, details: { reference: booking.reference, dryRun: isDryRun() } });
  if (booking.contact_phone) {
    await sendText({ to: booking.contact_phone, body: cancelledText(await practice(), booking.reference ?? ""), inquiryId: booking.inquiry_id, actor: "executor", action: "cancel_confirmation_sent", approvalId });
  }
  return { cancelled: booking.reference };
}
