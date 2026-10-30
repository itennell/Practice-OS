// Every text a caller ever gets from Front Desk, in plain code (Illinois HB 1806:
// logistics only, no advice, no empathy phrases, no guessing anyone's mood).
// Model output never becomes client text. The first text says it comes from an
// AI assistant. The greeting, first text, confirmation, reminder and the START,
// STOP and HELP replies match the campaign registered with the carriers word for
// word (docs/sms-opt-in.md); carriers check live traffic against it.

export type Practice = { practiceName: string; clinicianFirstName: string; consultMinutes: number; demo: boolean };

const STOP_LINE = "Reply STOP to opt out.";
// "CANCEL" alone is a carrier opt-out word, so consults are changed with R and C.
const CHANGE_LINE = "Reply R to reschedule or C to cancel.";

/** The voicemail greeting she records in her phone app. */
export function greetingText(p: Practice): string {
  return `Hi, this is ${p.clinicianFirstName} with ${p.practiceName}. Please leave your name and number, and our AI assistant will text you times for a free consultation this week. Message and data rates may apply. ${STOP_LINE}`;
}

/** The first text: three numbered times ("Tue 10am"). */
export function consultOptionsText(
  p: Practice,
  labels: string[],
  opts: { firstContact: boolean; name?: string | null; purpose: "book" | "reschedule" },
): string {
  const list = labels.map((l, i) => `${i + 1}) ${l}`).join(" ");
  const nums = labels.map((_, i) => i + 1);
  const pick = nums.length === 1 ? "Reply 1 to book." : `Reply ${nums.slice(0, -1).join(", ")} or ${nums.at(-1)} to book.`;
  if (opts.purpose === "reschedule") return `${p.practiceName}: New consult times: ${list}. ${pick} ${STOP_LINE}`;
  const hi = opts.name ? `Hi ${opts.name}` : "Hi";
  const who = opts.firstContact ? `this is the AI assistant for ${p.practiceName}` : `this is ${p.practiceName}`;
  return `${p.demo ? "Practice-OS demo: " : ""}${hi}, ${who}. Open consult times: ${list}. ${pick} ${STOP_LINE}`;
}

export function noTimesText(p: Practice, firstContact: boolean, name?: string | null): string {
  const hi = name ? `Hi ${name}` : "Hi";
  const who = firstContact ? `this is the AI assistant for ${p.practiceName}` : `this is ${p.practiceName}`;
  return `${hi}, ${who}. There are no open consult times this week. ${p.clinicianFirstName} will text you back. ${STOP_LINE}`;
}

/** `when` is "Wed at 2pm". */
export function bookedText(p: Practice, when: string, reference: string): string {
  return `${p.practiceName}: You're booked for a free ${p.consultMinutes}-minute phone consult ${when} (ref ${reference}). ${CHANGE_LINE} ${STOP_LINE}`;
}

export function rescheduledText(p: Practice, when: string, reference: string): string {
  return `${p.practiceName}: Your free ${p.consultMinutes}-minute phone consult is moved to ${when} (ref ${reference}). ${CHANGE_LINE} ${STOP_LINE}`;
}

export function cancelledText(p: Practice, reference: string): string {
  return `${p.practiceName}: Your phone consult (ref ${reference}) is cancelled. Reply BOOK for new times. ${STOP_LINE}`;
}

export function slotTakenText(p: Practice): string {
  return `${p.practiceName}: That time was just taken. New times are in the next text.`;
}

export function reminderText(p: Practice, when: string, reference: string): string {
  return `${p.practiceName} reminder: your free ${p.consultMinutes}-minute phone consult is tomorrow, ${when} (ref ${reference}). ${CHANGE_LINE} ${STOP_LINE}`;
}

export function passedOnText(p: Practice, firstContact: boolean): string {
  const who = firstContact ? `this is the AI assistant for ${p.practiceName}` : `this is ${p.practiceName}`;
  return `Hi, ${who}. I've passed your message to ${p.clinicianFirstName}, who will reply. ${STOP_LINE}`;
}

export function pickHelpText(p: Practice, count: number): string {
  return `${p.practiceName}: Please reply with a number from 1 to ${count} to pick a time.`;
}

export function noBookingText(p: Practice): string {
  return `${p.practiceName}: There's no upcoming consult on this number. Reply BOOK for open times.`;
}

export function startText(p: Practice): string {
  return `${p.practiceName}: You'll get texts about booking a consultation. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
}

export function stopText(p: Practice): string {
  return `${p.practiceName}: You're unsubscribed and won't get more texts. Reply START to resubscribe.`;
}

export function helpText(p: Practice): string {
  return `${p.practiceName} scheduling texts. For help call the practice line. In an emergency call 911; call or text 988 for the Suicide and Crisis Lifeline. ${STOP_LINE}`;
}

/**
 * The urgent alert. Never quotes the caller's words. The text to her own verified
 * phone gets the full number; the alert row on the page gets the masked one.
 */
export function crisisAlertText(channel: "voicemail" | "sms" | "web_chat", callerPhone: string | null): string {
  if (channel === "web_chat") {
    return "URGENT from Practice-OS Front Desk: a website chat message mentioned danger or self-harm. The visitor got the 988/911 message. Please check Front Desk now.";
  }
  const who = callerPhone ?? "a hidden number";
  return `URGENT from Practice-OS Front Desk: a ${channel === "voicemail" ? "voicemail" : "text"} from ${who} mentioned danger or self-harm. The caller got the 988/911 message. Please check Front Desk now.`;
}

// ---- website chat (typing only; same rules: logistics, AI disclosure first, no empathy phrases)

/** The first thing the website chat says, before the visitor types. */
export function webChatGreeting(p: Practice): string {
  return `Hi, I'm the AI assistant for ${p.practiceName}. I can help with booking a free ${p.consultMinutes}-minute phone consult and pass questions to ${p.clinicianFirstName}. I can't give advice. In an emergency call 911, or call or text 988.`;
}

export function webChatCheckingTimes(p: Practice): string {
  return `I'll get open consult times for you. ${p.clinicianFirstName} checks them first, so they'll show here in a few minutes. You can leave a phone number or email too.`;
}

/** Shown once she approves; `labels` are "Tue 10am". */
export function webChatTimes(p: Practice, labels: string[]): string {
  return `Open consult times with ${p.practiceName}: ${labels.map((l, i) => `${i + 1}) ${l}`).join(" ")}. Reply with a number and a phone number or email, and ${p.clinicianFirstName} will confirm.`;
}

export function webChatNoTimes(p: Practice): string {
  return `There are no open consult times this week. ${p.clinicianFirstName} will follow up if you leave a phone number or email.`;
}

export function webChatPassedOn(p: Practice): string {
  return `I've passed your message to ${p.clinicianFirstName}. Leave a phone number or email if you'd like a reply outside this chat.`;
}

export function webChatPicked(p: Practice): string {
  return `Got it. ${p.clinicianFirstName} will confirm the time. Leave a phone number or email if you haven't yet.`;
}
