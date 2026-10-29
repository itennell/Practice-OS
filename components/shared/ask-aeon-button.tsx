"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Orb } from "@/components/ui";

// Ask Aeon (calm redesign): Aeon is one tap away from every page that isn't the chat.
// A small floating pill, bottom right, that opens the chat home.

const HIDDEN = ["/", "/onboarding"];

export function AskAeonButton() {
  const pathname = usePathname();
  if (HIDDEN.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)))) return null;
  return (
    <>
      {/* Room at the end of the page so the button never covers the last row. */}
      <div aria-hidden className="h-10 shrink-0" />
      <Link
        href="/"
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex h-12 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--toast-bg)] py-1.5 pr-4 pl-1.5 text-small font-semibold text-[var(--fg)] shadow-[var(--tile-shadow)] transition-shadow duration-150 hover:shadow-[var(--tile-shadow-hover)] md:right-6 md:bottom-6"
      >
        <Orb size={36} />
        Ask Aeon
      </Link>
    </>
  );
}
