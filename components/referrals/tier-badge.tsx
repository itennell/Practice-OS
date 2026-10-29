import { TIER_LABEL, type Tier } from "@/lib/referrals/tier";

/** "Reach out first", "Next" or "Later", with the dot colour its map pin uses. */
export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-small font-semibold"
      style={{ color: `var(--tier-${tier}-fg)`, background: `var(--tier-${tier}-bg)` }}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--pin-${tier})` }} />
      {TIER_LABEL[tier]}
    </span>
  );
}
