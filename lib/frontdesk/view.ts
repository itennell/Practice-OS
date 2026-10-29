import { db } from "../db";

// What the Front Desk page shows. Logistics words only, never a caller's mood.

export type InquiryView = {
  id: string;
  who: string;
  channel: "voicemail" | "sms" | "web_chat";
  status: "new" | "options_sent" | "booked" | "needs_clinician" | "closed";
  summary: string | null;
  lastMessage: string | null;
  consultAt: string | null;
  crisis: boolean;
  updatedAt: string;
  isSample: boolean;
};

export type AlertView = { id: string; kind: "crisis" | "question" | "system"; message: string; createdAt: string; inquiryId: string | null; isSample: boolean };
export type ConsultView = { id: string; reference: string | null; who: string; startsAt: string; status: string; isSample: boolean };

export const FILTERS = ["all", "needs_you", "waiting", "booked"] as const;
export type Filter = (typeof FILTERS)[number];

export async function frontDeskView(filter: Filter = "all") {
  const statusFilter =
    filter === "needs_you" ? ["new", "needs_clinician"] : filter === "waiting" ? ["options_sent"] : filter === "booked" ? ["booked"] : null;
  const inquiries = await db()`
    select i.id, i.channel, i.status, i.summary, i.crisis_flag, i.updated_at, i.is_sample,
           coalesce(i.contact_name, i.contact_phone, i.contact_email, 'Unknown caller') as who,
           (select body from practice_os.messages m where m.inquiry_id = i.id order by m.created_at desc limit 1) as last_message,
           (select starts_at from practice_os.consult_bookings b where b.inquiry_id = i.id and b.status in ('booked', 'rescheduled')
             order by starts_at limit 1) as consult_at
    from practice_os.inquiries i
    where ${statusFilter ? db()`i.status in ${db()(statusFilter)}` : db()`i.status <> 'closed' or i.updated_at > now() - interval '7 days'`}
    order by i.crisis_flag desc, i.updated_at desc
    limit 100`;
  const alerts = await db()`
    select id, kind, message, created_at, inquiry_id, is_sample from practice_os.alerts
    where acknowledged_at is null and kind in ('crisis', 'question', 'system')
    order by (kind = 'crisis') desc, created_at desc limit 50`;
  const consults = await db()`
    select id, reference, coalesce(contact_name, contact_phone, 'Caller') as who, starts_at, status, is_sample
    from practice_os.consult_bookings
    where status in ('booked', 'rescheduled') and starts_at > now() - interval '1 hour'
    order by starts_at limit 20`;
  return {
    inquiries: inquiries.map(
      (r): InquiryView => ({
        id: r.id,
        who: r.who,
        channel: r.channel,
        status: r.status,
        summary: r.summary,
        lastMessage: r.last_message,
        consultAt: r.consult_at ? new Date(r.consult_at).toISOString() : null,
        crisis: r.crisis_flag,
        updatedAt: new Date(r.updated_at).toISOString(),
        isSample: r.is_sample,
      }),
    ),
    alerts: alerts.map((r): AlertView => ({ id: r.id, kind: r.kind, message: r.message, createdAt: new Date(r.created_at).toISOString(), inquiryId: r.inquiry_id, isSample: r.is_sample })),
    consults: consults.map((r): ConsultView => ({ id: r.id, reference: r.reference, who: r.who, startsAt: new Date(r.starts_at).toISOString(), status: r.status, isSample: r.is_sample })),
  };
}

export async function acknowledgeAlert(id: string): Promise<boolean> {
  const rows = await db()`update practice_os.alerts set acknowledged_at = now() where id = ${id} and acknowledged_at is null returning id`;
  return rows.length > 0;
}
