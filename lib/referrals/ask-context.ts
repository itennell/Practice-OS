// What the Referrals "Ask Aeon" box sends to the normal chat: her words, plus (as its own
// `context` field in the /api/chat body) which tab she asked from and which partners she
// picked (board names and card ids only). The server turns the context into one line
// added under her words for the model only (withContext): it never shows in her chat
// bubble or the chat's title, and isn't saved with her message. Pure, so the box, the
// route and the tests share it.

import { REFERRAL_TABS, type ReferralTab } from "./tabs";

/** The chat's limit on one message (app/api/chat/route.ts). */
export const CHAT_MAX = 4000;
/** A picked partner's name is cut to this many characters. */
export const NAME_MAX = 80;
/** At most this many picked partners go along (the line must leave room for her words). */
export const MAX_PICKED = 25;
/** The tab's name is cut to this many characters. */
export const TAB_MAX = 40;

/** What the box sends: a known tab id (lib/referrals/tabs.ts) and the picked card ids. Names come from her board on the server. */
export type AskContext = { tab: ReferralTab; picked: { id: string; name?: string }[] };

/** The tab's label for the context line, from its id. Never free text from the browser. */
export function tabLabel(tab: ReferralTab): string {
  return REFERRAL_TABS.find((t) => t.id === tab)?.label ?? "Referrals";
}

/** Control characters out (newlines and tabs become spaces), runs of spaces folded, trimmed. */
export function clean(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
}

/** The line added under her words. Partner names only, never a client. */
export function contextSuffix(tab: string, picked: { id: string; name: string }[]): string {
  const list = picked.slice(0, MAX_PICKED).map((p) => ({ id: clean(p.id).slice(0, 40), name: clean(p.name).slice(0, NAME_MAX) }));
  const who = list.length ? ` Partners I picked: ${JSON.stringify(list)}.` : "";
  return `\n\n${CONTEXT_MARK}${clean(tab).slice(0, TAB_MAX)}.${who})`;
}

/** Her words, cut so that her words plus the context line fit the chat's limit. */
export function withContext(text: string, tab: string, picked: { id: string; name: string }[]): string {
  return joinContext(text, contextSuffix(tab, picked));
}

/** Her words, cut to leave room, then a context line already built by contextSuffix. */
export function joinContext(text: string, suffix: string): string {
  const room = Math.max(0, CHAT_MAX - suffix.length);
  return `${text.trim().slice(0, room)}${suffix}`;
}

/** How the context line starts. */
export const CONTEXT_MARK = "(Asked from Referrals › ";

/**
 * Her words without a context line. Chats saved before the context became its own field
 * have it at the end of her message; it is dropped wherever her message or a title shows.
 */
export function withoutContext(text: string): string {
  const at = text.lastIndexOf(CONTEXT_MARK);
  if (at < 0) return text;
  return text.slice(0, at).trimEnd();
}
