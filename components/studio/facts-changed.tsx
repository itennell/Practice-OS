"use client";

// The "Facts changed" flag on a saved post or studio project whose words her saved
// details now contradict (lib/studio/stale.ts): what is wrong in plain words and a
// one-tap Regenerate that makes it again from her current facts.

import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "../ui";

export const FACTS_CHANGED = "Facts changed: needs update";

/**
 * Whether the studio shows the flag for an open project, and whether it offers Regenerate.
 * Every kind shows it (posts, carousels, reels and her own videos); a video from her own
 * footage can't be made again by Aeon, so it gets the flag without Regenerate.
 */
export function studioFlag(kind: string, problems: string[] | undefined): { show: boolean; regenerate: boolean } {
  const show = (problems?.length ?? 0) > 0;
  return { show, regenerate: show && kind !== "video" };
}

/** onRegenerate missing (a video from her own footage): the flag shows, with no Regenerate. */
export function FactsChanged({ problems, onRegenerate, busy = false }: { problems: string[]; onRegenerate?: () => void; busy?: boolean }) {
  if (!problems.length) return null;
  return (
    <div
      role="status"
      data-testid="facts-changed"
      className="flex flex-col gap-3 rounded-[20px] border border-[var(--hairline)] bg-[var(--status-pending-bg)] p-4 text-[var(--status-pending-fg)]"
    >
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert size={16} aria-hidden /> {FACTS_CHANGED}
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-small">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {onRegenerate && (
        <Button variant="quiet" className="w-full sm:w-fit" disabled={busy} onClick={onRegenerate}>
          <RefreshCw size={16} aria-hidden /> Regenerate
        </Button>
      )}
    </div>
  );
}
