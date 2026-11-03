// Shapes shared by the chat menu (a client component) and its loader (lib/ui/menu.ts, server only).

export type MenuData = {
  clinician: { name: string; credential: string; isSample: boolean } | null;
  /** urgent: missed crisis alerts, counted on the chat row while Admin is hidden (referrals-only demo). */
  counts: { approvals: number; admin: number; urgent: number };
  chats: { id: string; title: string }[];
  /** Practice links she turned off (Instagram after "Not for me" in onboarding). */
  hidden: string[];
};

export const EMPTY_MENU: MenuData = { clinician: null, counts: { approvals: 0, admin: 0, urgent: 0 }, chats: [], hidden: [] };
