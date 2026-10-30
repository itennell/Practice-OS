import { queueApproval } from "../approvals";
import { db } from "../db";
import { pickThree } from "./calendar/slots";
import type { CalendarAdapter } from "./calendar/types";
import { shortSlotLabel } from "./calendar/zone";
import { deps } from "./deps";
import { prettyPhone } from "./phone/numbers";
import { addAlert, getInquiry, isOptedOut, practice } from "./store";
import { consultOptionsText, noTimesText, passedOnText } from "./templates";

// Three open consult times for a caller, as one text_consult_options approval.
// Runs on its own when her "Text callers I miss" switch is on (the Front Desk
// rule origin set by the caller of this function).

// "times for a free consultation this week" (the registered greeting), so "Tue 10am" is unambiguous.
export const OFFER_DAYS = 7;
export const OFFER_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export type OfferOutcome = "queued" | "no_phone" | "opted_out" | "no_calendar" | "no_times";

export async function offerTimes(
  inquiryId: string,
  opts: { purpose: "book" | "reschedule"; bookingId?: string | null; createdBy?: string; /** "Simulate a voicemail" without a calendar: the sample one. */ calendar?: CalendarAdapter },
): Promise<{ outcome: OfferOutcome; approvalId?: string }> {
  const inquiry = await getInquiry(inquiryId);
  if (!inquiry?.contact_phone) {
    await addAlert("question", "A caller left no number Front Desk could text. Listen to the voicemail in your phone app.", inquiryId);
    await db()`update practice_os.inquiries set status = 'needs_clinician' where id = ${inquiryId}`;
    return { outcome: "no_phone" };
  }
  if (await isOptedOut(inquiry.contact_phone)) return { outcome: "opted_out" };

  const { calendar, timeZone, now } = deps();
  const cal = opts.calendar ?? (await calendar());
  const p = await practice();
  const firstContact = inquiry.ai_disclosed_at == null;
  const who = inquiry.contact_name ?? prettyPhone(inquiry.contact_phone);
  if (!cal) {
    await addAlert("system", `Front Desk couldn't offer times to ${who}: no calendar is connected.`, inquiryId);
    await db()`update practice_os.inquiries set status = 'needs_clinician' where id = ${inquiryId}`;
    return { outcome: "no_calendar" };
  }

  const tz = await timeZone();
  const t0 = now();
  const slots = pickThree(await cal.openSlots(t0, new Date(t0.getTime() + OFFER_DAYS * 86_400_000)), t0, tz);

  // Older offers to this caller stop counting: "2" always means the newest list.
  await db()`
    update practice_os.consult_offers set status = 'superseded'
    where inquiry_id = ${inquiryId} and status in ('pending', 'sent')`;

  if (slots.length === 0) {
    await addAlert("question", `No open consult times in the next ${OFFER_DAYS} days to offer ${who}.`, inquiryId);
    await db()`update practice_os.inquiries set status = 'needs_clinician' where id = ${inquiryId}`;
    const approvalId = await queueApproval({
      kind: "sms_reply",
      title: `Tell ${who} there are no open times`,
      preview: { to: prettyPhone(inquiry.contact_phone), text: noTimesText(p, firstContact, inquiry.contact_name) },
      payload: { inquiry_id: inquiryId, to: inquiry.contact_phone, body: noTimesText(p, firstContact, inquiry.contact_name) },
      createdBy: opts.createdBy ?? "front_desk",
    });
    return { outcome: "no_times", approvalId };
  }

  const json = slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }));
  const [offer] = await db()<{ id: string }[]>`
    insert into practice_os.consult_offers (inquiry_id, purpose, booking_id, slots)
    values (${inquiryId}, ${opts.purpose}, ${opts.bookingId ?? null}, ${db().json(json as never)})
    returning id`;
  const labels = slots.map((s) => shortSlotLabel(s.start, tz));
  const body = consultOptionsText(p, labels, { firstContact, name: inquiry.contact_name, purpose: opts.purpose });
  const approvalId = await queueApproval({
    kind: "text_consult_options",
    title: `Text ${who} ${slots.length} consult time${slots.length === 1 ? "" : "s"}`,
    preview: { to: prettyPhone(inquiry.contact_phone), text: body, times: labels },
    payload: { offer_id: offer.id, inquiry_id: inquiryId, to: inquiry.contact_phone, body },
    createdBy: opts.createdBy ?? "front_desk",
  });
  return { outcome: "queued", approvalId };
}

/** A question Front Desk can't answer goes to her; the caller gets one fixed "passed on" text. */
export async function passToClinician(inquiryId: string, note: string): Promise<string | null> {
  const inquiry = await getInquiry(inquiryId);
  await addAlert("question", note, inquiryId);
  await db()`update practice_os.inquiries set status = 'needs_clinician' where id = ${inquiryId}`;
  if (!inquiry?.contact_phone || (await isOptedOut(inquiry.contact_phone))) return null;
  const [recent] = await db()`
    select 1 from practice_os.approvals
    where kind = 'sms_reply' and payload ->> 'inquiry_id' = ${inquiryId} and payload ->> 'purpose' = 'passed_on'
      and created_at > now() - interval '12 hours'`;
  if (recent) return null; // one "passed on" text per half day is plenty
  const p = await practice();
  const body = passedOnText(p, inquiry.ai_disclosed_at == null);
  return queueApproval({
    kind: "sms_reply",
    title: `Tell ${inquiry.contact_name ?? prettyPhone(inquiry.contact_phone)} you'll reply`,
    preview: { to: prettyPhone(inquiry.contact_phone), text: body },
    payload: { inquiry_id: inquiryId, to: inquiry.contact_phone, body, purpose: "passed_on" },
    createdBy: "front_desk",
  });
}
