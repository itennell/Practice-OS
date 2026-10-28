// Every text a caller ever gets from Front Desk, in plain code (Illinois HB 1806:
// logistics only, no advice, no empathy phrases, no guessing anyone's mood).
// Model output never becomes client text. The first text to a number says it
// comes from an AI assistant.

export type Practice = { practiceName: string; clinicianFirstName: string };

const STOP_LINE = "Reply STOP to opt out.";

function hello(practice: Practice, firstContact: boolean, name?: string | null): string {
  const greet = name ? `Hi ${name}, ` : "Hi, ";
  return firstContact ? `${greet}this is the AI assistant for ${practice.practiceName}.` : `${greet}this is ${practice.practiceName}.`;
}

/** Three times, numbered. `labels` come from slotLabel(). */
export function consultOptionsText(
  practice: Practice,
  labels: string[],
  opts: { firstContact: boolean; name?: string | null; purpose: "book" | "reschedule" },
): string {
  const lead = opts.purpose === "reschedule" ? "New consult times:" : "Open consult times:";
  const list = labels.map((l, i) => `${i + 1}) ${l}`).join(" ");
  const pick = labels.length === 1 ? "Reply 1 to book it." : `Reply ${labels.map((_, i) => i + 1).join(", ").replace(/, (\d)$/, " or $1")}.`;
  return `${hello(practice, opts.firstContact, opts.name)} ${lead} ${list}. ${pick} ${STOP_LINE}`;
}

export function noTimesText(practice: Practice, firstContact: boolean, name?: string | null): string {
  return `${hello(practice, firstContact, name)} There are no open consult times right now. ${practice.clinicianFirstName} will text you back. ${STOP_LINE}`;
}

export function bookedText(practice: Practice, label: string, reference: string): string {
  return `You're booked: phone consult with ${practice.practiceName}, ${label}. Ref ${reference}. Reply R to reschedule or C to cancel.`;
}

export function rescheduledText(practice: Practice, label: string, reference: string): string {
  return `Your phone consult with ${practice.practiceName} is moved to ${label}. Ref ${reference}. Reply R to reschedule or C to cancel.`;
}

export function cancelledText(practice: Practice, reference: string): string {
  return `Your phone consult with ${practice.practiceName} (ref ${reference}) is cancelled. Reply BOOK any time for new times.`;
}

export function slotTakenText(): string {
  return "That time was just taken. Here are new times in the next text.";
}

export function reminderText(practice: Practice, label: string, reference: string): string {
  return `Reminder: phone consult with ${practice.practiceName} tomorrow, ${label}. Ref ${reference}. Reply R to reschedule or C to cancel.`;
}

export function passedOnText(practice: Practice, firstContact: boolean): string {
  return `${hello(practice, firstContact)} I've passed your message to ${practice.clinicianFirstName}, who will reply. ${STOP_LINE}`;
}

export function pickHelpText(count: number): string {
  return `Please reply with a number from 1 to ${count} to pick a time.`;
}

export function noBookingText(): string {
  return "There's no upcoming consult on this number. Reply BOOK for open times.";
}

export function stopText(practice: Practice): string {
  return `You won't get more texts from ${practice.practiceName}. Reply START to undo.`;
}

export function helpText(practice: Practice): string {
  return `${practice.practiceName}: texts about consult times. Reply STOP to opt out. In an emergency call 911; for crisis support call or text 988.`;
}

/** The urgent alert to the clinician's own verified phone. Never quotes the caller's words. */
export function crisisAlertText(channel: "voicemail" | "sms", callerPhone: string | null): string {
  const who = callerPhone ?? "a hidden number";
  return `URGENT from Practice-OS Front Desk: a ${channel === "voicemail" ? "voicemail" : "text"} from ${who} mentioned danger or self-harm. The caller got the 988/911 message. Please check Front Desk now.`;
}
