// Shapes shared by the chat menu (a client component) and its loader (lib/ui/menu.ts, server only).

export type MenuData = {
  clinician: { name: string; credential: string; isSample: boolean } | null;
  counts: { approvals: number; admin: number };
  chats: { id: string; title: string }[];
};

export const EMPTY_MENU: MenuData = { clinician: null, counts: { approvals: 0, admin: 0 }, chats: [] };
