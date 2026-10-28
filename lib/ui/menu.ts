import { listConversations } from "../aeon/chat";
import { morningBrief } from "../compliance/brief";
import { db } from "../db";
import { getProfile } from "../profile";
import type { MenuData } from "./menu-types";

// What the chat menu (UI-005) shows beside its links: who she is, how many
// approvals wait, how many admin things are due this week, and her recent chats.
// Read-only. Every part falls back to empty so the menu still draws without a database.

/** Runs a read and gives `fallback` if it fails, including when there is no DATABASE_URL at all. */
const safe = async <T>(read: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await read();
  } catch {
    return fallback;
  }
};

export async function loadMenuData(): Promise<MenuData> {
  const [profile, waiting, brief, chats] = await Promise.all([
    safe(getProfile, null),
    safe(() => db()<{ n: number }[]>`select count(*)::int as n from practice_os.approvals where status = 'pending'`, [{ n: 0 }]),
    safe(morningBrief, null),
    safe(() => listConversations(30), []),
  ]);
  return {
    clinician: profile ? { name: profile.full_name, credential: profile.credential, isSample: profile.is_sample } : null,
    counts: {
      approvals: waiting[0]?.n ?? 0,
      admin: brief ? brief.this_week.length + brief.urgent_soon.length + brief.payer_dates.length : 0,
    },
    chats: chats.map((c) => ({ id: c.id, title: c.title })),
  };
}
