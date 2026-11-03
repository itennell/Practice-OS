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

// ---- The words she sees: five columns (Board, Partners, the panel) ----------------

export const BOARD_COLUMNS = ["found", "reached_out", "met", "referring", "not_a_fit"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export const COLUMN_LABEL: Record<BoardColumn, string> = {
  found: "Found",
  reached_out: "Reached out",
  met: "Met",
  referring: "Referring",
  not_a_fit: "Not a fit",
};

/**
 * Which column a card sits in. The stages are found, contacted, follow_up, connected
 * and not_a_fit (lib/referrals/stages.ts): Reached out is contacted and follow up;
 * connected (met or replied) is Met, or Referring once they have referred someone.
 */
export function columnFor(card: { stage: Stage }, contacts: { kind: string }[]): BoardColumn {
  switch (card.stage) {
    case "found":
      return "found";
    case "contacted":
    case "follow_up":
      return "reached_out";
    case "connected":
      return contacts.some((c) => c.kind === "referred") ? "referring" : "met";
    default:
      return "not_a_fit";
  }
}

/** The stage a card dropped in a column gets. Referring is connected plus a logged referral. */
export const COLUMN_STAGE: Record<BoardColumn, Stage> = {
  found: "found",
  reached_out: "contacted",
  met: "connected",
  referring: "connected",
  not_a_fit: "not_a_fit",
};

export type BoardMove =
  | { do: "none" }
  | { do: "stage"; stage: Stage }
  /** Into Referring: she confirms, and a dated "they referred someone" entry is logged (which also makes it connected). */
  | { do: "log_referral" }
  /** Out of Referring (to any column): the referral is in her log, so the card can't leave it by a drag. */
  | { do: "explain" }
  /** Not a fit into Referring: she moves them back first; no referral is logged for a card set aside. */
  | { do: "refuse" };

export function boardMove(from: BoardColumn, to: BoardColumn): BoardMove {
  if (from === to) return { do: "none" };
  if (from === "referring") return { do: "explain" };
  if (to === "referring") return from === "not_a_fit" ? { do: "refuse" } : { do: "log_referral" };
  return { do: "stage", stage: COLUMN_STAGE[to] };
}

