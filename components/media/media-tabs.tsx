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

/** Media's column: wide on Psychology Today (the interview sits beside the profile preview), 860px elsewhere. */
export function MediaWidth({ children }: { children: React.ReactNode }) {
  const wide = usePathname() === "/media";
  return <div className={`mx-auto flex w-full flex-col gap-6 ${wide ? "max-w-[1240px]" : "max-w-[860px]"}`}>{children}</div>;
}
