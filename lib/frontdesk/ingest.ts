import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { queueApproval } from "../approvals";
import { withOrigin } from "../approval-policy";
import { loadApprovalSettings } from "../approval-settings";
import { audit } from "../audit";
import { db } from "../db";
import { transcribe, transcriptText } from "../meta";
import { checkIdentity, type PhiKind } from "../aeon/identity-filter";
import { checkCrisis, type CrisisResult } from "../safety";
import type { CalendarAdapter } from "./calendar/types";
import { handleCrisis } from "./crisis";
import { deps } from "./deps";
import { readIntent, type Extracted } from "./extract";
import { offerTimes, passToClinician } from "./offers";
import { prettyPhone } from "./phone/numbers";
import type { Call, InboundText, MessageVendor, PhoneAdapter, Voicemail } from "./phone/types";
import { maskPhone } from "./redact";
import { parseReply } from "./reply";
import { activeBookingFor, addAlert, addMessage, addMessageMeta, hasMessage, inquiryForPhone, openOfferFor, practice, sendText } from "./store";
import { helpText, noBookingText, pickHelpText, startText, stopText } from "./templates";

// One voicemail or one text, start to finish. Order is fixed (AGENTS.md):
// save it, crisis check in plain code, only then any model, then the rules.
// Everything runs under the Front Desk rule origin, so her switches decide
// what goes out without her tap.

const NO_TRANSCRIPT = "(Front Desk couldn't turn this voicemail into text. Listen to it in your phone app.)";

/** Muse first; the phone company's own transcript if Muse fails or the audio isn't WAV. */
export async function voicemailTranscript(v: Voicemail): Promise<{ text: string | null; source: "muse" | "provider" | null }> {
  try {
    const audio = await v.audio();
    const isWav = audio.bytes.subarray(0, 4).toString("ascii") === "RIFF" && audio.bytes.subarray(8, 12).toString("ascii") === "WAVE";
    if (isWav) {
      const file = path.join(tmpdir(), `practice-os-voicemail-${randomUUID()}.wav`);
      try {
        await writeFile(file, audio.bytes);
        const text = transcriptText(await transcribe("front_desk.voicemail", file, { mode: "PUSH_TO_TALK" })).trim();
        if (text) return { text, source: "muse" };
      } finally {
        await unlink(file).catch(() => {});
      }
    }
  } catch {
    // fall through to the provider's transcript
  }
  const fallback = v.providerTranscript?.trim();
  return fallback ? { text: fallback, source: "provider" } : { text: null, source: null };
}

/**
 * What the inbox shows as the safety result: the crisis check's category and
 * which kinds of private detail the plain-code check sees (a caller's name or
 * number is expected). Front Desk keeps the words for her; the flag tells her
 * they never go into Aeon's memory.
 */
export function safetyResult(text: string, crisis: CrisisResult): { crisis: string | null; private: PhiKind[] } {
  const found: PhiKind[] = [];
  for (const kind of ["client_name", "contact", "birth_date", "identifier", "diagnosis", "address"] as const) {
    if (!checkIdentity(text, { names: [], contacts: [] }, [kind]).ok) found.push(kind);
  }
  return { crisis: crisis.crisis ? crisis.category : null, private: found };
}

async function saveSafety(vendor: MessageVendor, providerId: string, text: string, crisis: CrisisResult) {
  await addMessageMeta(vendor, providerId, { safety: safetyResult(text, crisis) });
}

async function rules() {
  return (await loadApprovalSettings()).frontDesk;
}

async function actOnIntent(inquiryId: string, phone: string | null, intent: Extracted["intent"], note: string, calendar?: CalendarAdapter) {
  const now = deps().now();
  if ((intent === "reschedule" || intent === "cancel") && phone) {
    const booking = await activeBookingFor(phone, now);
    if (booking) {
      if (intent === "reschedule") return offerTimes(inquiryId, { purpose: "reschedule", bookingId: booking.id });
      return queueApproval({
        kind: "consult_cancel",
        title: `Cancel consult ${booking.reference ?? ""}`.trim(),
        preview: { reference: booking.reference, starts_at: booking.starts_at },
        payload: { booking_id: booking.id, inquiry_id: inquiryId },
        createdBy: "front_desk",
      });
    }
  }
  if (intent === "question" || intent === "other") return passToClinician(inquiryId, note);
  return offerTimes(inquiryId, { purpose: "book", calendar });
}

export async function processVoicemail(
  v: Voicemail,
  phone: PhoneAdapter,
  /** "Simulate a voicemail": the calendar to read times from when hers isn't connected. */
  opts: { calendar?: CalendarAdapter } = {},
): Promise<"skipped" | "crisis" | "done"> {
  if (await hasMessage(phone.vendor, v.id)) return "skipped";
  const { text, source } = await voicemailTranscript(v);
  const sample = phone.vendor === "sample";
  const [inquiry] = await db()<{ id: string }[]>`
    insert into practice_os.inquiries (channel, contact_phone, status, is_sample) values ('voicemail', ${v.from}, 'new', ${sample}) returning id`;
  await addMessage({
    inquiryId: inquiry.id,
    direction: "inbound",
    channel: "voicemail",
    body: text ?? NO_TRANSCRIPT,
    vendor: phone.vendor,
    providerId: v.id,
    meta: { call_id: v.callId ?? null, seconds: v.seconds ?? null, transcript: source },
    isSample: sample,
  });
  await audit({ actor: "system", action: "voicemail_received", subjectType: "inquiry", subjectId: inquiry.id, details: { vendor: phone.vendor, transcript: source } });

  if (!text) {
    await addAlert("question", `New voicemail from ${v.from ? maskPhone(v.from) : "a hidden number"}. Front Desk couldn't read it; listen in your phone app.`, inquiry.id);
    await db()`update practice_os.inquiries set status = 'needs_clinician' where id = ${inquiry.id}`;
    return "done";
  }

  const crisis = checkCrisis(text); // before any model, always
  await saveSafety(phone.vendor, v.id, text, crisis);
  if (crisis.crisis) {
    await handleCrisis({ inquiryId: inquiry.id, channel: "voicemail", from: v.from, category: crisis.category, phone });
    return "crisis";
  }

  const x = await readIntent(text, v.from);
  await db()`
    update practice_os.inquiries
    set contact_name = ${x.name}, contact_phone = ${x.callbackNumber}, summary = ${x.summary}
    where id = ${inquiry.id}`;
  const who = x.name ?? (x.callbackNumber ? prettyPhone(x.callbackNumber) : "A caller");
  const act = () => actOnIntent(inquiry.id, x.callbackNumber, x.intent, `${who} left a voicemail: ${x.summary}`, opts.calendar);
  // A [Sample] always waits for her tap, so the test shows the approval step.
  if (sample) await act();
  else await withOrigin({ rule: "front_desk", rules: await rules() }, act);
  return "done";
}

export async function processText(t: InboundText, phone: PhoneAdapter): Promise<"skipped" | "crisis" | "done"> {
  if (await hasMessage(phone.vendor, t.id)) return "skipped";
  const inquiry = await inquiryForPhone(t.from, "sms");
  const added = await addMessage({ inquiryId: inquiry.id, direction: "inbound", channel: "sms", body: t.body, vendor: phone.vendor, providerId: t.id });
  if (!added) return "skipped";

  const crisis = checkCrisis(t.body); // before anything else, always
  await saveSafety(phone.vendor, t.id, t.body, crisis);
  if (crisis.crisis) {
    await handleCrisis({ inquiryId: inquiry.id, channel: "sms", from: t.from, category: crisis.category, phone });
    return "crisis";
  }

  const now = deps().now();
  const offer = await openOfferFor(t.from, now);
  const reply = parseReply(t.body, offer?.slots.length ?? 3);
  const who = inquiry.contact_name ?? prettyPhone(t.from);

  // STOP, START and HELP: the registered one-line replies (docs/sms-opt-in.md). On
  // Twilio, Advanced Opt-Out sends these same texts itself, so the app stays quiet
  // there to avoid doubles; on other phone companies the app sends them.
  const carrierReplies = phone.vendor === "twilio";
  if (reply.kind === "stop") {
    await db()`insert into practice_os.sms_opt_outs (phone) values (${t.from}) on conflict do nothing`;
    await audit({ actor: "system", action: "sms_opt_out", subjectType: "inquiry", subjectId: inquiry.id });
    if (!carrierReplies) {
      await sendText({ to: t.from, body: stopText(await practice()), inquiryId: inquiry.id, actor: "executor", action: "stop_confirmation_sent", force: true, phone }).catch(() => {});
    }
    return "done";
  }
  if (reply.kind === "start") {
    await db()`delete from practice_os.sms_opt_outs where phone = ${t.from}`;
    await audit({ actor: "system", action: "sms_opt_in", subjectType: "inquiry", subjectId: inquiry.id });
    if (!carrierReplies) {
      await sendText({ to: t.from, body: startText(await practice()), inquiryId: inquiry.id, actor: "executor", action: "start_confirmation_sent", phone }).catch(() => {});
    }
    return "done";
  }

  await withOrigin({ rule: "front_desk", rules: await rules() }, async () => {
    const quick = async (body: string, title: string) =>
      queueApproval({ kind: "sms_reply", title, preview: { to: prettyPhone(t.from), text: body }, payload: { inquiry_id: inquiry.id, to: t.from, body }, createdBy: "front_desk" });

    switch (reply.kind) {
      case "help":
        if (carrierReplies) return null;
        return quick(helpText(await practice()), `Send ${who} the help text`);
      case "choice": {
        if (!offer) return passToClinician(inquiry.id, `${who} texted: "${t.body.slice(0, 200)}"`);
        if (reply.index > offer.slots.length) return quick(pickHelpText(await practice(), offer.slots.length), `Ask ${who} to pick 1 to ${offer.slots.length}`);
        const kind = offer.purpose === "reschedule" ? "consult_reschedule" : "consult_booking";
        return queueApproval({
          kind,
          title: `${offer.purpose === "reschedule" ? "Move" : "Book"} ${who}'s consult (time ${reply.index})`,
          preview: { to: prettyPhone(t.from), choice: reply.index, starts_at: offer.slots[reply.index - 1].start },
          payload: { offer_id: offer.id, index: reply.index, inquiry_id: inquiry.id },
          createdBy: "front_desk",
        });
      }
      case "reschedule":
      case "cancel": {
        const booking = await activeBookingFor(t.from, now);
        if (!booking) return quick(noBookingText(await practice()), `Tell ${who} there's no consult to change`);
        return actOnIntent(inquiry.id, t.from, reply.kind, "");
      }
      case "book":
        return offerTimes(inquiry.id, { purpose: "book" });
      default: {
        // A free-form text ("I'd like to set up a consult"): Muse reads the intent;
        // plain code still decides. Anything that isn't a booking request goes to her.
        const x = await readIntent(t.body, t.from);
        if (x.name && !inquiry.contact_name) await db()`update practice_os.inquiries set contact_name = ${x.name} where id = ${inquiry.id}`;
        if (x.intent === "book") return offerTimes(inquiry.id, { purpose: "book" });
        if (x.intent === "reschedule" || x.intent === "cancel") return actOnIntent(inquiry.id, t.from, x.intent, `${who} texted: "${t.body.slice(0, 200)}"`);
        return passToClinician(inquiry.id, `${who} texted: "${t.body.slice(0, 200)}"`);
      }
    }
  });
  return "done";
}

/**
 * One call to the practice line, for the inbox. A call starts nothing on its
 * own: its voicemail (if one was left) does. It joins the caller's open
 * conversation, or starts a closed one so it never shows as waiting on her.
 */
export async function processCall(c: Call, phone: PhoneAdapter): Promise<"skipped" | "done"> {
  if (await hasMessage(phone.vendor, c.id)) return "skipped";
  const [open] = c.from
    ? await db()<{ id: string }[]>`
        select id from practice_os.inquiries
        where contact_phone = ${c.from} and status <> 'closed' and updated_at > now() - interval '30 days' and not is_sample
        order by updated_at desc limit 1`
    : [];
  const inquiryId =
    open?.id ??
    (await db()<{ id: string }[]>`
      insert into practice_os.inquiries (channel, contact_phone, status) values ('call', ${c.from}, 'closed') returning id`)[0].id;
  const body = c.seconds > 0 ? "Called the practice line" : "Missed call";
  const added = await addMessage({ inquiryId, direction: "inbound", channel: "call", body, vendor: phone.vendor, providerId: c.id, meta: { seconds: c.seconds, status: c.status } });
  return added ? "done" : "skipped";
}
