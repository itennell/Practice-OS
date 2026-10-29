"use client";

import { usePathname } from "next/navigation";
import { ChipLink } from "@/components/ui";

const TABS = [
  { href: "/media", label: "Psychology Today and directories" },
  { href: "/media/website", label: "Website" },
  { href: "/media/instagram", label: "Instagram" },
];

/** Media's three tabs: where she lists herself, her website, and Instagram (left out if she said it isn't for her). */
export function MediaTabs({ hideInstagram }: { hideInstagram: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Media" className="flex flex-wrap gap-2">
      {TABS.filter((t) => !(hideInstagram && t.href === "/media/instagram")).map((t) => (
        <ChipLink key={t.href} href={t.href} on={path === t.href}>
          {t.label}
        </ChipLink>
      ))}
    </nav>
  );
}
