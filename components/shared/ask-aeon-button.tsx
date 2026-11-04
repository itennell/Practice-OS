"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Orb } from "@/components/ui";

// Ask Aeon (calm redesign): Aeon is one tap away from every page that isn't the chat.
// A small floating pill, bottom right, that opens the chat home. On phones, and on
// the wide Referrals board, it is just the orb (48px), so it covers as little as
// possible of the text scrolling under it (wave 4 UI test).

// Hidden where the page is the chat (/), has its own message box (Referrals) or is the interview.
const HIDDEN = ["/", "/onboarding", "/referrals"];
// Pages whose content reaches the right edge on a wide screen: the orb alone there too.
const ORB_ONLY = ["/referrals"];

const under = (pathname: string, p: string) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`));

export function AskAeonButton() {
  const pathname = usePathname();
  if (HIDDEN.some((p) => under(pathname, p))) return null;
  const orbOnly = ORB_ONLY.some((p) => under(pathname, p));
  return (
    <>
      {/* Room at the end of the page so the pill (48px tall, 24px off the edge) and the phone's
          home-bar area never cover the last row. */}
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom,0px))] shrink-0" />
      <Link
        href="/"
        aria-label="Ask Aeon"
        title="Ask Aeon"
        className={`fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex h-12 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--toast-bg)] p-1.5 text-small font-semibold text-[var(--fg)] shadow-[var(--tile-shadow)] transition-shadow duration-150 hover:shadow-[var(--tile-shadow-hover)] md:right-6 md:bottom-6 ${
          orbOnly ? "" : "md:pr-4"
        }`}
      >
        <Orb size={36} />
        {!orbOnly && (
          <span aria-hidden className="hidden md:inline">
            Ask Aeon
          </span>
        )}
      </Link>
    </>
  );
}
