"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Orb } from "@/components/ui";

// Ask Aeon (calm redesign): Aeon is one tap away from every page that isn't the chat.
// A small floating pill, bottom right, that opens the chat home.

// Hidden where the page is the chat (/), has its own message box (the Instagram studio) or is the interview.
const HIDDEN = ["/", "/onboarding", "/instagram", "/media/instagram"];

export function AskAeonButton() {
  const pathname = usePathname();
  if (HIDDEN.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)))) return null;
  return (
    <>
      {/* Room at the end of the page so the pill (48px tall, 24px off the edge) and the phone's
          home-bar area never cover the last row. */}
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom,0px))] shrink-0" />
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
