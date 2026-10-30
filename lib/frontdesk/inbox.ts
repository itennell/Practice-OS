import { db } from "../db";
import { prettyPhone } from "./phone/numbers";

// The Front Desk inbox: one timeline of calls, voicemails, texts in and out,
// and consult bookings, newest first. Callers aren't her clients yet, but their
// numbers are still private, so the page gets the last four digits only; the
// full number comes from /api/front-desk/reveal, one at a time, written to the log.

export const INBOX_FILTERS = ["all", "needs_you", "calls", "voicemails", "texts", "bookings"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export type InboxKind = "call" | "voicemail" | "text_in" | "text_out" | "booking";

export type Safety = { crisis: string | null; private: string[] };

export type InboxItem = {
  /** The message or booking id. */
  id: string;
  kind: InboxKind;
  at: string;
  /** "(•••) •••-0144", or "Hidden number". */
  caller: string;
  /** Whether a full number can be revealed. */
  hasNumber: boolean;
  name: string | null;
  body: string;
  inquiryId: string | null;
  status: "new" | "options_sent" | "booked" | "needs_clinician" | "closed" | null;
  crisis: boolean;
  isSample: boolean;
  /** Voicemails: whether the phone company has audio to play. */
  playable: boolean;
  seconds: number | null;
  safety: Safety | null;
  /** Texts out: logged instead of sent (DRY_RUN or a [Sample]). */
  dryRun: boolean;
  /** Bookings: the reference ("FD-1042") and when. */
  reference: string | null;
  startsAt: string | null;
};

/** "(•••) •••-0144": enough to tell callers apart, not enough to call them. */
export function maskPhone(e164: string | null): string {
  if (!e164) return "Hidden number";
  const digits = e164.replace(/\D/g, "");
  return digits.length >= 4 ? `(•••) •••-${digits.slice(-4)}` : "Hidden number";
}

const KIND_FILTER: Partial<Record<InboxFilter, InboxKind[]>> = {
  calls: ["call"],
  voicemails: ["voicemail"],
  texts: ["text_in", "text_out"],
  bookings: ["booking"],
};

type Row = {
  id: string;
  kind: InboxKind;
  at: Date;
  phone: string | null;
  name: string | null;
  body: string;
  inquiry_id: string | null;
  status: InboxItem["status"];
  crisis: boolean;
  is_sample: boolean;
  vendor: string | null;
  provider_sid: string | null;
  meta: Record<string, unknown> | null;
  reference: string | null;
  starts_at: Date | null;
};

export async function frontDeskInbox(filter: InboxFilter = "all", limit = 100): Promise<InboxItem[]> {
  const rows = await db()<Row[]>`
    with timeline as (
      select m.id, case
               when m.channel = 'call' then 'call'
               when m.channel = 'voicemail' then 'voicemail'
               when m.direction = 'inbound' then 'text_in'
               else 'text_out' end as kind,
             m.created_at as at, i.contact_phone as phone, i.contact_name as name, m.body,
             i.id as inquiry_id, i.status, i.crisis_flag as crisis, (m.is_sample or i.is_sample) as is_sample,
             m.vendor, m.provider_sid, m.meta, null::text as reference, null::timestamptz as starts_at
      from practice_os.messages m
      join practice_os.inquiries i on i.id = m.inquiry_id
      where m.channel in ('call', 'voicemail', 'sms')
        -- a call that left a voicemail shows once, as the voicemail
        and not (m.channel = 'call' and exists (
          select 1 from practice_os.messages v
          where v.channel = 'voicemail' and v.meta ->> 'call_id' = m.provider_sid))
      union all
      select b.id, 'booking', b.created_at, coalesce(b.contact_phone, i.contact_phone), coalesce(b.contact_name, i.contact_name),
             b.status, b.inquiry_id, i.status, coalesce(i.crisis_flag, false), b.is_sample,
             null, null, null, b.reference, b.starts_at
      from practice_os.consult_bookings b
      left join practice_os.inquiries i on i.id = b.inquiry_id
    )
    select * from timeline
    where at > now() - interval '60 days'
      ${KIND_FILTER[filter] ? db()`and kind in ${db()(KIND_FILTER[filter]!)}` : db()``}
      ${filter === "needs_you" ? db()`and status in ('new', 'needs_clinician') and kind <> 'text_out'` : db()``}
    order by at desc
    limit ${limit}`;
  return rows.map((r) => {
    const meta = r.meta ?? {};
    const safety = meta.safety && typeof meta.safety === "object" ? (meta.safety as Safety) : null;
    return {
      id: r.id,
      kind: r.kind,
      at: new Date(r.at).toISOString(),
      caller: maskPhone(r.phone),
      hasNumber: Boolean(r.phone),
      name: r.name,
      body: r.body,
      inquiryId: r.inquiry_id,
      status: r.status,
      crisis: r.crisis,
      isSample: r.is_sample,
      playable: r.kind === "voicemail" && r.vendor === "twilio" && Boolean(r.provider_sid),
      seconds: typeof meta.seconds === "number" ? meta.seconds : null,
      safety,
      dryRun: meta.dryRun === true,
      reference: r.reference,
      startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : null,
    };
  });
}

/** The full number behind one inbox row, for the Show button. */
export async function revealNumber(id: string): Promise<string | null> {
  const [row] = await db()<{ phone: string | null }[]>`
    select i.contact_phone as phone from practice_os.messages m join practice_os.inquiries i on i.id = m.inquiry_id where m.id = ${id}
    union all
    select coalesce(b.contact_phone, i.contact_phone) from practice_os.consult_bookings b
      left join practice_os.inquiries i on i.id = b.inquiry_id where b.id = ${id}
    limit 1`;
  return row?.phone ? prettyPhone(row.phone) : null;
}

/** When Front Desk last read each stream, and the last problem, for "Check now". */
export async function lastCheck(): Promise<{ checkedAt: string | null; error: string | null }> {
  const rows = await db()<{ last_checked_at: Date | null; last_error: string | null }[]>`
    select last_checked_at, last_error from practice_os.front_desk_sync order by last_checked_at desc nulls last`;
  const newest = rows[0]?.last_checked_at;
  return { checkedAt: newest ? new Date(newest).toISOString() : null, error: rows.find((r) => r.last_error)?.last_error ?? null };
}

/** The recording id and phone company of one voicemail, for the audio route. */
export async function voicemailRecording(id: string): Promise<{ vendor: string; sid: string } | null> {
  const [row] = await db()<{ vendor: string | null; provider_sid: string | null }[]>`
    select vendor, provider_sid from practice_os.messages where id = ${id} and channel = 'voicemail'`;
  return row?.vendor && row.provider_sid ? { vendor: row.vendor, sid: row.provider_sid } : null;
}
