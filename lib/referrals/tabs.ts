// The Referrals page's tabs, in order (?tab= in the URL). Shared by the page (server)
// and the tabs themselves (client).

export const REFERRAL_TABS = [
  { id: "partners", label: "Partners" },
  { id: "overview", label: "Overview" },
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
  { id: "map", label: "Map" },
  { id: "meetings", label: "Meetings and notes" },
] as const;

export type ReferralTab = (typeof REFERRAL_TABS)[number]["id"];

export const isReferralTab = (v: unknown): v is ReferralTab => REFERRAL_TABS.some((t) => t.id === v);
