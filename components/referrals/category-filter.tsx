"use client";

import { chipClass } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/referrals/categories";
import { cn } from "@/lib/utils";

const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";

/** The catalog categories present in a list, in category order, with how many of each. */
export function categoriesIn(items: { category?: number | null }[]): { id: number; label: string; count: number }[] {
  const counts = new Map<number, number>();
  for (const it of items) if (it.category) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([id]) => CATEGORY_LABELS[id])
    .map(([id, count]) => ({ id, label: CATEGORY_LABELS[id], count }));
}

/**
 * Chips to show one of the 13 source categories (only those present) or all.
 * Toggle buttons (aria-pressed), 44px, wrapping on a phone.
 */
export function CategoryFilter({
  label,
  categories,
  value,
  onChange,
  total,
}: {
  label: string;
  categories: { id: number; label: string; count: number }[];
  value: number | null;
  onChange: (category: number | null) => void;
  total: number;
}) {
  if (categories.length < 2) return null;
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap gap-2">
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={chipClass(value === null, true, FOCUS)}>
        All <span className="ml-1.5 tabular-nums">{total}</span>
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={value === c.id}
          onClick={() => onChange(value === c.id ? null : c.id)}
          className={chipClass(value === c.id, true, cn("max-w-full min-w-0", FOCUS))}
        >
          <span className="truncate">{c.label}</span>
          <span className="ml-1.5 shrink-0 tabular-nums">{c.count}</span>
        </button>
      ))}
    </div>
  );
}
