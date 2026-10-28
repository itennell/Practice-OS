import { audit } from "../audit";
import { db } from "../db";
import { isDryRun } from "../env";
import { deps } from "./deps";
import { PhoneError, type PhoneAdapter } from "./phone/types";
import type { Practice } from "./templates";

// Database helpers for the Front Desk tables (migrations 001 and 016).

export type InquiryRow = {
  id: string;
  channel: "voicemail" | "sms" | "web_chat";
  contact_name: string | null;
  contact_phone: string | null;
  summary: string | null;
  status: "new" | "options_sent" | "booked" | "needs_clinician" | "closed";
  crisis_flag: boolean;
  ai_disclosed_at: Date | null;
};

export type OfferRow = {
  id: string;
  inquiry_id: string;
  purpose: "book" | "reschedule";
  booking_id: string | null;
  slots: Array<{ start: string; end: string }>;
  status: "pending" | "sent" | "chosen" | "superseded" | "expired";
  expires_at: Date | null;
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
};

export async function practice(): Promise<Practice> {
  const [p] = await db()`select full_name, practice_name from practice_os.clinician_profile limit 1`.catch(() => []);
  const first = typeof p?.full_name === "string" ? p.full_name.split(" ")[0] : "the clinician";
  return { practiceName: p?.practice_name ?? "the practice", clinicianFirstName: first };
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
  channel: "voicemail" | "sms";
  body: string;
  vendor: string;
  providerId: string | null;
}): Promise<boolean> {
  const rows = await db()`
    insert into practice_os.messages (inquiry_id, direction, channel, body, vendor, provider_sid)
    values (${m.inquiryId}, ${m.direction}, ${m.channel}, ${m.body}, ${m.vendor}, ${m.providerId})
    on conflict (vendor, provider_sid) do nothing returning id`;
  return rows.length > 0;
}

export async function isOptedOut(phone: string): Promise<boolean> {
  const [row] = await db()`select 1 from practice_os.sms_opt_outs where phone = ${phone}`;
  return Boolean(row);
}

export async function addAlert(kind: "crisis" | "question" | "system", message: string, inquiryId: string | null): Promise<void> {
  await db()`insert into practice_os.alerts (kind, inquiry_id, message) values (${kind}, ${inquiryId}, ${message})`;
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
  const dryRun = isDryRun();
  let id: string | null = null;
  if (!dryRun) {
    const phone = input.phone ?? (await deps().phone());
    if (!phone) throw new PhoneError("No phone connected", "Connect your phone company on the Front Desk page.");
    id = (await phone.sendText(input.to, input.body)).id;
  }
  const vendor = input.phone?.vendor ?? (await deps().phone().catch(() => null))?.vendor ?? "twilio";
  if (input.inquiryId) {
    await addMessage({ inquiryId: input.inquiryId, direction: "outbound", channel: "sms", body: input.body, vendor, providerId: id });
  }
  await audit({
    actor: input.actor,
    action: input.action,
    approvalId: input.approvalId ?? null,
    subjectType: "inquiry",
    subjectId: input.inquiryId,
    details: { dryRun, chars: input.body.length, provider_id: id },
  });
  return { sent: !dryRun, dryRun, id };
}
