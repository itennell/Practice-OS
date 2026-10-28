// The Referrals board's columns: the referral_sources.stage CHECK (migration 001).
// Kept apart from store.ts so the board's client code can import it.
export const STAGES = ["found", "contacted", "follow_up", "connected", "not_a_fit"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  found: "Found",
  contacted: "Contacted",
  follow_up: "Follow up",
  connected: "Connected",
  not_a_fit: "Not a fit",
};
