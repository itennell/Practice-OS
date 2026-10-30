import { audit } from "../audit";
import { db } from "../db";
import { isDryRun } from "../env";
import { deps } from "./deps";
import { PhoneError, type MessageVendor, type PhoneAdapter } from "./phone/types";
import { blankContacts } from "./redact";
import type { Practice } from "./templates";

// Database helpers for the Front Desk tables (migrations 001 and 016).

export type InquiryRow = {
  id: string;
  channel: "voicemail" | "sms" | "web_chat" | "call";
  contact_name: string | null;
  contact_phone: string | null;
  summary: string | null;
  status: "new" | "options_sent" | "booked" | "needs_clinician" | "closed";
  crisis_flag: boolean;
  ai_disclosed_at: Date | null;
  is_sample: boolean;
};

export type OfferRow = {
  id: string;
  inquiry_id: string;
  purpose: "book" | "reschedule";
  booking_id: string | null;
  slots: Array<{ start: string; end: string }>;
  status: "pending" | "sent" | "chosen" | "superseded" | "expired";
  expires_at: Date | null;
  is_sample: boolean;
};

export type BookingRow = {
  id: string;
  inquiry_id: string | null;
  calendar_provider: "calcom" | "google" | null;
  external_id: string | null;
  reference: string | null;
  starts_at: Date;
  ends_at: Date;
  status: string;
  contact_name: string | null;
  contact_phone: string | null;
  is_sample: boolean;
};

/** How texts name the practice: "Reyes Counseling" (no PLLC/LLC), her first name, consult length, and demo mode. */
export async function practice(): Promise<Practice> {
  const [p] = await db()`
    select c.full_name, c.practice_name, s.front_desk_consult_minutes
    from practice_os.clinician_profile c left join practice_os.settings s on true limit 1`.catch(() => []);
  const first = typeof p?.full_name === "string" ? p.full_name.split(" ")[0] : "the clinician";
  const name = typeof p?.practice_name === "string" ? p.practice_name.replace(/,?\s+(PLLC|LLC|PC|P\.C\.|Inc\.?)$/i, "") : "the practice";
  return {
    practiceName: name,
    clinicianFirstName: first,
    consultMinutes: typeof p?.front_desk_consult_minutes === "number" ? p.front_desk_consult_minutes : 15,
    // Isaiah's developer line is the demo: its first text starts "Practice-OS demo:" (registered campaign).
    demo: process.env.FRONT_DESK_DEV_TWILIO === "true",
  };
}

export async function getInquiry(id: string): Promise<InquiryRow | null> {
  const [row] = await db()<InquiryRow[]>`select * from practice_os.inquiries where id = ${id}`;
  return row ?? null;
}

/** The caller's open conversation, or a new inquiry. */
export async function inquiryForPhone(phone: string, channel: InquiryRow["channel"]): Promise<InquiryRow> {
  const [open] = await db()<InquiryRow[]>`
    select * from practice_os.inquiries
    where contact_phone = ${phone} and status <> 'closed' and updated_at > now() - interval '30 days' and not is_sample
    order by updated_at desc limit 1`;
  if (open) return open;
  const [row] = await db()<InquiryRow[]>`
    insert into practice_os.inquiries (channel, contact_phone, status) values (${channel}, ${phone}, 'new') returning *`;
  return row;
}

export async function hasMessage(vendor: string, providerId: string): Promise<boolean> {
  const [row] = await db()`select 1 from practice_os.messages where vendor = ${vendor} and provider_sid = ${providerId}`;
  return Boolean(row);
}

export async function addMessage(m: {
  inquiryId: string;
  direction: "inbound" | "outbound";
  channel: "voicemail" | "sms" | "call";
  body: string;
  vendor: MessageVendor;
  providerId: string | null;
  /** What the inbox shows beside it (migration 037): call length, recording id, safety result. */
  meta?: Record<string, unknown>;
  isSample?: boolean;
}): Promise<boolean> {
  const rows = await db()`
    insert into practice_os.messages (inquiry_id, direction, channel, body, vendor, provider_sid, meta, is_sample)
    values (${m.inquiryId}, ${m.direction}, ${m.channel}, ${m.body}, ${m.vendor}, ${m.providerId}, ${db().json((m.meta ?? {}) as never)}, ${m.isSample ?? false})
    on conflict (vendor, provider_sid) do nothing returning id`;
  return rows.length > 0;
}

/** Adds to a message's inbox details (the safety result once the checks have run). */
export async function addMessageMeta(vendor: MessageVendor, providerId: string, meta: Record<string, unknown>): Promise<void> {
  await db()`
    update practice_os.messages set meta = meta || ${db().json(meta as never)}
    where vendor = ${vendor} and provider_sid = ${providerId}`;
}

async function isSampleInquiry(id: string | null): Promise<boolean> {
  if (!id) return false;
  const [row] = await db()`select is_sample from practice_os.inquiries where id = ${id}`;
  return Boolean(row?.is_sample);
}

export async function isOptedOut(phone: string): Promise<boolean> {
  const [row] = await db()`select 1 from practice_os.sms_opt_outs where phone = ${phone}`;
  return Boolean(row);
}

/**
 * One line for "What needs you". Stored and shown with caller numbers down to the
 * last four digits and emails blanked; only the text to her own phone has the full number.
 */
export async function addAlert(kind: "crisis" | "question" | "system", message: string, inquiryId: string | null): Promise<void> {
  await db()`insert into practice_os.alerts (kind, inquiry_id, message) values (${kind}, ${inquiryId}, ${blankContacts(message).text})`;
}

export async function activeBookingFor(phone: string, now: Date): Promise<BookingRow | null> {
  const [row] = await db()<BookingRow[]>`
    select * from practice_os.consult_bookings
    where contact_phone = ${phone} and status in ('booked', 'rescheduled') and starts_at > ${now} and not is_sample
    order by starts_at limit 1`;
  return row ?? null;
}

export async function openOfferFor(phone: string, now: Date): Promise<OfferRow | null> {
  const [row] = await db()<OfferRow[]>`
    select o.* from practice_os.consult_offers o
    join practice_os.inquiries i on i.id = o.inquiry_id
    where i.contact_phone = ${phone} and o.status = 'sent' and (o.expires_at is null or o.expires_at > ${now})
    order by o.sent_at desc limit 1`;
  return row ?? null;
}

export async function nextReference(): Promise<string> {
  const [row] = await db()`
    select coalesce(max(substring(reference from 4)::int), 1000) + 1 as n
    from practice_os.consult_bookings where reference ~ '^FD-[0-9]+$'`;
  return `FD-${row.n}`;
}

/**
 * Sends one text from her phone company. DRY_RUN logs instead. Every send is
 * written to messages and audit_log. Numbers that texted STOP are refused,
 * except for the fixed crisis reply (`force`).
 */
export async function sendText(input: {
  to: string;
  body: string;
  inquiryId: string | null;
  actor: "executor" | "safety";
  action: string;
  approvalId?: string;
  force?: boolean;
  phone?: PhoneAdapter | null;
}): Promise<{ sent: boolean; dryRun: boolean; id: string | null }> {
  if (!input.force && (await isOptedOut(input.to))) {
    throw new PhoneError("Number opted out", "This caller texted STOP, so Front Desk can't text them.");
  }
  // A [Sample] conversation or the stand-in phone never reaches a real phone,
  // DRY_RUN or not: it is logged like a dry run.
  const sample = input.phone?.vendor === "sample" || (await isSampleInquiry(input.inquiryId));
  const dryRun = isDryRun() || sample;
  let id: string | null = null;
  if (!dryRun) {
    const phone = input.phone ?? (await deps().phone());
    if (!phone) throw new PhoneError("No phone connected", "Connect your phone company on the Front Desk page.");
    id = (await phone.sendText(input.to, input.body)).id;
  }
  const vendor = sample ? "sample" : (input.phone?.vendor ?? (await deps().phone().catch(() => null))?.vendor ?? "twilio");
  if (input.inquiryId) {
    await addMessage({ inquiryId: input.inquiryId, direction: "outbound", channel: "sms", body: input.body, vendor, providerId: id, meta: { dryRun }, isSample: sample });
  }
  await audit({
    actor: input.actor,
    action: input.action,
    approvalId: input.approvalId ?? null,
    subjectType: "inquiry",
    subjectId: input.inquiryId,
    details: { dryRun, sample, chars: input.body.length, provider_id: id },
  });
  return { sent: !dryRun, dryRun, id };
}
