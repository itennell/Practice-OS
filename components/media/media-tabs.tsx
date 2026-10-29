"use client";

import { usePathname } from "next/navigation";
import { ChipLink } from "@/components/ui";

const TABS = [
  { href: "/media", label: "Psychology Today and directories" },
  { href: "/media/website", label: "Website" },
  { href: "/media/instagram", label: "Instagram" },
];

/** Media's three tabs: where she lists herself, her website, and Instagram. */
export function MediaTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Media" className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <ChipLink key={t.href} href={t.href} on={path === t.href}>
          {t.label}
        </ChipLink>
      ))}
    </nav>
  );
}
