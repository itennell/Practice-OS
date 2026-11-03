// What the Referrals "Ask Aeon" box sends to the normal chat: her words, then one line
// saying which tab she asked from and which partners she picked (board names and card
// ids only, as a quoted JSON list). Pure, so the box and the tests share it.

/** The chat's limit on one message (app/api/chat/route.ts). */
export const CHAT_MAX = 4000;
/** A picked partner's name is cut to this many characters. */
export const NAME_MAX = 80;
/** At most this many picked partners go along (the line must leave room for her words). */
export const MAX_PICKED = 25;

/** Control characters out (newlines and tabs become spaces), runs of spaces folded, trimmed. */
export function clean(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
}

/** The line added under her words. Partner names only, never a client. */
export function contextSuffix(tab: string, picked: { id: string; name: string }[]): string {
  const list = picked.slice(0, MAX_PICKED).map((p) => ({ id: clean(p.id).slice(0, 40), name: clean(p.name).slice(0, NAME_MAX) }));
  const who = list.length ? ` Partners I picked: ${JSON.stringify(list)}.` : "";
  return `\n\n(Asked from Referrals › ${clean(tab).slice(0, 40)}.${who})`;
}

/** Her words, cut so that her words plus the context line fit the chat's limit. */
export function withContext(text: string, tab: string, picked: { id: string; name: string }[]): string {
  const suffix = contextSuffix(tab, picked);
  const room = Math.max(0, CHAT_MAX - suffix.length);
  return `${text.trim().slice(0, room)}${suffix}`;
}
