import { queueApprovalOnce } from "../approvals";
import { audit } from "../audit";
import { db } from "../db";
import { checkCrisis, CRISIS_REPLY } from "../safety";
import { pickThree } from "./calendar/slots";
import { shortSlotLabel } from "./calendar/zone";
import { handleCrisis } from "./crisis";
import { deps } from "./deps";
import { readIntent } from "./extract";
import { safetyResult } from "./ingest";
import { spokenNumber } from "./mask";
import { OFFER_DAYS } from "./offers";
import { addAlert, addMessage, practice } from "./store";
import {
  webChatCalendarUnavailable,
  webChatCheckingTimes,
  webChatGreeting,
  webChatNoTimes,
  webChatPassedOn,
  webChatPicked,
  webChatTimes,
} from "./templates";
import { allowWebChat, WEB_CHAT_POSTS_PER_MINUTE } from "./webchat-rate-limit";

// The practice website chat (Front Desk, typing only). Same rules as texts:
// it says it is an AI assistant before anything else, the crisis check runs on
// every message before any model, Muse only sees the masked words (mask.ts),
// and every reply is fixed wording, never model output (HB 1806: logistics
// only). The quick replies only say what happens next; the consult times
// themselves are a web_chat_reply approval and show in the chat once she
// approves it. Questions go to her as an alert.

export const MAX_CHARS = 1000;
export const MAX_MESSAGES = 40;
export const WEB_CHAT_DAILY_MESSAGES = 250;
export const WEB_CHAT_RETENTION_DAYS = 30;
const CRISIS_BODY = "[Message withheld after the safety check]";
let lastPurgeAt = 0;

export type ChatLine = { id: string; from: "visitor" | "assistant"; text: string; at: string };

const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class WebChatError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

/** Deletes expired public chats and their pending replies; the audit trail keeps category-only safety events. */
export async function purgeExpiredWebChats(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - WEB_CHAT_RETENTION_DAYS * 86_400_000);
  return (await db().begin(async (sql) => {
    const expired = await sql<{ id: string }[]>`
      select i.id from practice_os.inquiries i
      where i.channel = 'web_chat' and i.created_at < ${cutoff}
        and not exists (
          select 1 from practice_os.messages m where m.inquiry_id = i.id and m.created_at >= ${cutoff}
        )`;
    if (expired.length === 0) return 0;
    const ids = expired.map((row) => row.id);
    await sql`delete from practice_os.approvals where kind = 'web_chat_reply' and payload ->> 'inquiry_id' in ${sql(ids)}`;
    await sql`delete from practice_os.alerts where inquiry_id in ${sql(ids)}`;
    await sql`delete from practice_os.inquiries where id in ${sql(ids)}`;
    return ids.length;
  })) as number;
}

async function maybePurge(now: Date): Promise<void> {
  if (now.getTime() - lastPurgeAt < 60 * 60_000) return;
  lastPurgeAt = now.getTime();
  await purgeExpiredWebChats(now).catch(() => {});
}

async function dailyCapReached(now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 86_400_000);
  const [{ n }] = await db()<{ n: number }[]>`
    select count(*)::int as n from practice_os.messages
    where channel = 'web_chat' and direction = 'inbound' and created_at >= ${since}`;
  return n >= WEB_CHAT_DAILY_MESSAGES;
}

/** The visitor's conversation so far, oldest first. The id is a random UUID only their browser holds. */
export async function webChatThread(conversation: string): Promise<ChatLine[] | null> {
  if (!UUID.test(conversation)) return null;
  const [inq] = await db()`select 1 from practice_os.inquiries where id = ${conversation} and channel = 'web_chat'`;
  if (!inq) return null;
  const rows = await db()<{ id: string; direction: string; body: string; created_at: Date }[]>`
    select id, direction, body, created_at from practice_os.messages
    where inquiry_id = ${conversation} and channel = 'web_chat' order by created_at, id`;
  return rows.map((r) => ({ id: r.id, from: r.direction === "inbound" ? "visitor" : "assistant", text: r.body, at: new Date(r.created_at).toISOString() }));
}

async function say(inquiryId: string, text: string) {
  await addMessage({ inquiryId, direction: "outbound", channel: "web_chat", body: text, vendor: "web", providerId: null });
}

async function startConversation(): Promise<string> {
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.inquiries (channel, status, ai_disclosed_at) values ('web_chat', 'new', now()) returning id`;
  await say(row.id, webChatGreeting(await practice())); // the AI disclosure comes first, always
  await audit({ actor: "system", action: "web_chat_started", subjectType: "inquiry", subjectId: row.id });
  return row.id;
}

/** Three open times as an approval; the visitor sees them once she approves. */
async function queueTimes(inquiryId: string): Promise<"queued" | "none" | "unavailable"> {
  const [waiting] = await db()`
    select 1 from practice_os.approvals
    where kind = 'web_chat_reply' and status in ('pending', 'running') and payload ->> 'inquiry_id' = ${inquiryId}
    limit 1`;
  if (waiting) return "queued";
  const { calendar, timeZone, now } = deps();
  const [tz, cal] = await Promise.all([timeZone().catch(() => null), calendar().catch(() => null)]);
  if (!tz || !cal) return "unavailable";
  const t0 = now();
  const open = await cal.openSlots(t0, new Date(t0.getTime() + OFFER_DAYS * 86_400_000)).catch(() => null);
  if (!open) return "unavailable";
  const slots = pickThree(open, t0, tz);
  if (slots.length === 0) return "none";
  const labels = slots.map((s) => shortSlotLabel(s.start, tz));
  const body = webChatTimes(await practice(), labels);
  await queueApprovalOnce(
    {
      kind: "web_chat_reply",
      title: `Show a website visitor ${slots.length} consult time${slots.length === 1 ? "" : "s"}`,
      preview: { to: "Website chat", text: body, times: labels },
      payload: { inquiry_id: inquiryId, body, slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })) },
      createdBy: "front_desk",
    },
    { payloadField: "inquiry_id", value: inquiryId },
  );
  return "queued";
}

/** One message from a website visitor. Returns the conversation id and the thread. */
export async function webChatMessage(input: {
  conversation: string | null;
  text: string;
  rateLimitKey?: string;
}): Promise<{ conversation: string; lines: ChatLine[] }> {
  // The safety check intentionally precedes every length, message-count, rate
  // and daily-cap refusal. A visitor at a limit still receives the fixed help.
  const crisis = checkCrisis(input.text);
  const text = input.text.trim();
  if (!text) throw new WebChatError("Type a message first.");
  if (!crisis.crisis && text.length > MAX_CHARS) throw new WebChatError(`Please keep messages under ${MAX_CHARS} characters.`);

  const now = deps().now();
  await maybePurge(now);
  if (!crisis.crisis && input.rateLimitKey && !allowWebChat(input.rateLimitKey, WEB_CHAT_POSTS_PER_MINUTE)) {
    throw new WebChatError("That is a lot of messages in a minute. Wait a minute and try again.", 429);
  }
  if (!crisis.crisis && (await dailyCapReached(now))) {
    throw new WebChatError("The website chat has reached its limit for today. Please call the practice line instead.", 429);
  }

  const known = input.conversation && (await webChatThread(input.conversation)) ? input.conversation : null;
  const inquiryId = known ?? (await startConversation());

  if (crisis.crisis) {
    // Never retain the visitor's crisis words: category only, plus a neutral placeholder.
    await addMessage({
      inquiryId,
      direction: "inbound",
      channel: "web_chat",
      body: CRISIS_BODY,
      vendor: "web",
      providerId: null,
      meta: { safety: { crisis: crisis.category } },
    });
    await db()`update practice_os.inquiries set updated_at = now() where id = ${inquiryId}`;
    await say(inquiryId, CRISIS_REPLY);
    await handleCrisis({ inquiryId, channel: "web_chat", from: null, category: crisis.category, phone: await deps().phone().catch(() => null) });
    return { conversation: inquiryId, lines: (await webChatThread(inquiryId))! };
  }

  const [{ n }] = await db()`select count(*)::int as n from practice_os.messages where inquiry_id = ${inquiryId} and direction = 'inbound'`;
  if (n >= MAX_MESSAGES) throw new WebChatError("This chat is full. Please call the practice line instead.", 429);

  await addMessage({ inquiryId, direction: "inbound", channel: "web_chat", body: text, vendor: "web", providerId: null, meta: { safety: safetyResult(text, crisis) } });
  await db()`update practice_os.inquiries set updated_at = now() where id = ${inquiryId}`;
  const p = await practice();

  // Contact details stay in plain code: a number or email she can reply to.
  const phone = spokenNumber(text);
  const email = EMAIL.exec(text)?.[0] ?? null;
  if (phone || email) {
    await db()`
      update practice_os.inquiries set contact_phone = coalesce(contact_phone, ${phone}), contact_email = coalesce(contact_email, ${email})
      where id = ${inquiryId}`;
  }

  const [offer] = await db()<{ status: string }[]>`
    select status from practice_os.approvals
    where kind = 'web_chat_reply' and status in ('pending', 'running', 'done') and payload ->> 'inquiry_id' = ${inquiryId}
    order by created_at desc limit 1`;
  const pick = /^\s*([1-3])\b/.exec(text);
  if (offer?.status === "done" && pick) {
    await addAlert("question", `A website visitor picked consult time ${pick[1]}. Confirm it with them${phone || email ? " (they left contact details)" : ""}.`, inquiryId);
    await db()`update practice_os.inquiries set status = 'needs_clinician' where id = ${inquiryId}`;
    await say(inquiryId, webChatPicked(p));
  } else if ((phone || email) && text.replace(EMAIL, "").replace(/[\d\s().+-]/g, "").length < 12) {
    // Only contact details: nothing new to decide.
    await say(inquiryId, webChatPassedOn(p));
  } else {
    const x = await readIntent(text, null);
    if (x.name) await db()`update practice_os.inquiries set contact_name = coalesce(contact_name, ${x.name}) where id = ${inquiryId}`;
    if (x.intent === "book" && offer?.status !== "done") {
      const times = await queueTimes(inquiryId);
      if (times === "queued") await say(inquiryId, webChatCheckingTimes(p));
      else if (times === "none") {
        await addAlert("question", `No open consult times in the next ${OFFER_DAYS} days for a website visitor.`, inquiryId);
        await say(inquiryId, webChatNoTimes(p));
      } else {
        await addAlert("system", "Website chat could not check the connected calendar. Follow up with this visitor if they left contact details.", inquiryId);
        await say(inquiryId, webChatCalendarUnavailable(p));
      }
    } else {
      await addAlert("question", `A website visitor wrote: ${x.summary}`, inquiryId);
      await db()`update practice_os.inquiries set status = 'needs_clinician', summary = ${x.summary} where id = ${inquiryId}`;
      await say(inquiryId, webChatPassedOn(p));
    }
  }
  return { conversation: inquiryId, lines: (await webChatThread(inquiryId))! };
}
