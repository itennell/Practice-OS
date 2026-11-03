import { listConversations } from "../aeon/chat";
import { loadNeeds } from "../admin/load";
import { db } from "../db";
import { visibleKind } from "../approvals";
import { REFERRAL_DEMO_HIDDEN_PAGES, REFERRALS_ONLY_DEMO } from "../features";
import { getProfile } from "../profile";
import type { MenuData } from "./menu-types";

// What the chat menu (UI-005) shows beside its links: who she is, how many
// approvals wait, how many things Admin says her practice needs next, and her recent chats.
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
  const [profile, waiting, needs, chats] = await Promise.all([
    safe(getProfile, null),
    safe(() => db()<{ n: number }[]>`select count(*)::int as n from practice_os.approvals where status = 'pending' and ${visibleKind()}`, [{ n: 0 }]),
    REFERRALS_ONLY_DEMO ? [] : safe(loadNeeds, []), // Admin is hidden in the referrals-only demo (lib/features.ts)
    safe(() => listConversations(30), []),
  ]);
  return {
    clinician: profile ? { name: profile.full_name, credential: profile.credential, isSample: profile.is_sample } : null,
    counts: {
      approvals: waiting[0]?.n ?? 0,
      // Only what is pressing (overdue, this week, blocking gaps), not every setup question.
      admin: needs.filter((n) => n.tier <= 3).length,
    },
    chats: chats.map((c) => ({ id: c.id, title: c.title })),
    // Media stays for everyone, even when Instagram isn't for her. Only the referrals-only demo hides pages.
    hidden: REFERRALS_ONLY_DEMO ? [...REFERRAL_DEMO_HIDDEN_PAGES] : [],
  };
}
