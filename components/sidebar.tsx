"use client";

// The dark chat menu (UI-005), ChatGPT style: Aeon, New chat, Search chats, the
// practice links with counts, her recent chats, and the clinician at the bottom
// (UI-029). Desktop keeps it on the left; phones open the same menu as a panel
// that slides in from the left.

import { Dialog } from "@base-ui/react/dialog";
import { Brain, Camera, ClipboardList, Inbox, Menu, Phone, Plus, Search, Settings, Users, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Avatar } from "@/components/shared/avatar";
import { EMPTY_MENU, type MenuData } from "@/lib/ui/menu-types";
import { cn } from "@/lib/utils";
import { Orb } from "./ui";

/** Fired by the chat when a conversation starts or gets a reply, so the menu reloads its list. */
export const CHATS_CHANGED = "aeon:chats-changed";
/** Fired by the menu's New chat so an open chat clears itself even when the URL is already "/". */
export const NEW_CHAT = "aeon:new-chat";

// The ring sits inside each row so the scrolling list never clips it.
const FOCUS = "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--menu-focus)] focus-visible:outline-solid";

type PracticeLink = { href: string; label: string; icon: LucideIcon; count?: keyof MenuData["counts"]; countWord?: string; also?: string[] };

const PRACTICE: PracticeLink[] = [
  // Until /admin exists, Admin is a group over the pages it will replace.
  { href: "/deadlines", label: "Admin", icon: ClipboardList, count: "admin", countWord: "due soon", also: ["/paperwork", "/how-do-i", "/dashboard"] },
  { href: "/approvals", label: "Approvals", icon: Inbox, count: "approvals", countWord: "waiting" },
  { href: "/referrals", label: "Referrals", icon: Users },
  { href: "/instagram", label: "Instagram", icon: Camera },
  { href: "/front-desk", label: "Front Desk", icon: Phone },
];

const ADMIN_PAGES = [
  { href: "/deadlines", label: "Deadlines" },
  { href: "/paperwork", label: "Paperwork" },
  { href: "/how-do-i", label: "How do I" },
];

const isAt = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

async function fetchMenu(): Promise<MenuData | null> {
  const res = await fetch("/api/menu", { cache: "no-store" }).catch(() => null);
  return res?.ok ? ((await res.json()) as MenuData) : null;
}

// The open chat is in ?c=, which the chat sets with history.replaceState, so watch the URL directly.
const currentChat = () => new URLSearchParams(window.location.search).get("c");
function watchUrl(onChange: () => void) {
  window.addEventListener(CHATS_CHANGED, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(CHATS_CHANGED, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function MenuBody({ data, chatId, onNavigate }: { data: MenuData; chatId: string | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const chats = q ? data.chats.filter((c) => c.title.toLowerCase().includes(q)) : data.chats;
  const onChat = pathname === "/";
  const row = (active: boolean) =>
    cn(
      "flex min-h-touch items-center gap-3 rounded-[14px] px-3 text-body transition-colors duration-150",
      active ? "bg-[var(--menu-active)] font-semibold text-[var(--menu-fg)]" : "text-[var(--menu-muted)] hover:bg-[var(--menu-hover)] hover:text-[var(--menu-fg)]",
      FOCUS,
    );

  const newChat = () => {
    window.dispatchEvent(new Event(NEW_CHAT));
    router.push("/");
    onNavigate?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-3 text-[var(--menu-fg)]">
      <div className="flex items-center gap-3 px-2 pt-2">
        <Orb size={32} />
        <div className="min-w-0">
          <p className="font-semibold leading-tight">Aeon</p>
          <p className="text-small text-[var(--menu-muted)]">Practice co-owner</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={newChat}
          className={cn(
            "flex h-touch items-center gap-2 rounded-full border border-[var(--menu-line)] px-4 font-semibold text-[var(--menu-fg)] hover:bg-[var(--menu-hover)]",
            FOCUS,
          )}
        >
          <Plus aria-hidden size={18} />
          New chat
        </button>
        <label className="flex h-touch items-center gap-2 rounded-full border border-[var(--menu-line)] px-4 text-[var(--menu-muted)] focus-within:border-[var(--menu-focus)]">
          <Search aria-hidden size={16} className="shrink-0" />
          <span className="sr-only">Search chats</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-full min-w-0 flex-1 bg-transparent text-body text-[var(--menu-fg)] outline-none placeholder:text-[var(--menu-muted)]"
          />
        </label>
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {!q && (
          <div className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-label font-semibold tracking-[0.06em] text-[var(--menu-muted)] uppercase">Practice</p>
            <ul className="flex flex-col gap-0.5">
              {PRACTICE.map(({ href, label, icon: Icon, count, countWord, also }) => {
                const n = count ? data.counts[count] : 0;
                const here = isAt(pathname, href) || (also ?? []).some((h) => isAt(pathname, h));
                return (
                  <li key={label}>
                    <Link href={href} onClick={onNavigate} aria-current={here && label !== "Admin" ? "page" : undefined} className={row(here)}>
                      <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
                      <span className="flex-1">{label}</span>
                      {n > 0 && (
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--menu-badge)] px-2 text-small font-semibold text-[var(--menu-fg)] tabular-nums">
                          {n}
                          <span className="sr-only"> {countWord}</span>
                        </span>
                      )}
                    </Link>
                    {label === "Admin" && (
                      <ul className="ml-[2.375rem] flex flex-col">
                        {ADMIN_PAGES.map((p) => (
                          <li key={p.href}>
                            <Link
                              href={p.href}
                              onClick={onNavigate}
                              aria-current={isAt(pathname, p.href) ? "page" : undefined}
                              className={cn(row(isAt(pathname, p.href)), "min-h-10 text-small")}
                            >
                              {p.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-label font-semibold tracking-[0.06em] text-[var(--menu-muted)] uppercase">
            {q ? "Matching chats" : "Recent chats"}
          </p>
          {chats.length === 0 ? (
            <p className="px-3 text-small text-[var(--menu-muted)]">{q ? "No chat matches that." : "No chats yet."}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {chats.map((c) => {
                const here = onChat && c.id === chatId;
                return (
                  <li key={c.id}>
                    <Link href={`/?c=${c.id}`} onClick={onNavigate} aria-current={here ? "page" : undefined} className={cn(row(here), "py-2 text-small leading-snug")}>
                      <span className="line-clamp-2">{c.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-[var(--menu-line)] pt-3">
        <Link href="/memory" onClick={onNavigate} aria-current={isAt(pathname, "/memory") ? "page" : undefined} className={row(isAt(pathname, "/memory"))}>
          <Brain aria-hidden size={18} strokeWidth={1.75} />
          Memory
        </Link>
        <Link href="/settings" onClick={onNavigate} aria-current={isAt(pathname, "/settings") ? "page" : undefined} className={row(isAt(pathname, "/settings"))}>
          <Settings aria-hidden size={18} strokeWidth={1.75} />
          Settings
        </Link>
        {data.clinician && (
          <Link href="/settings" onClick={onNavigate} className={cn(row(false), "mt-1 py-2")}>
            <Avatar name={data.clinician.name} tone="lilac" size="sm" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-semibold text-[var(--menu-fg)]">
                {data.clinician.name}
                {data.clinician.credential && `, ${data.clinician.credential}`}
              </span>
              {data.clinician.isSample && <span className="truncate text-small">Fictional demo practice</span>}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ initial = EMPTY_MENU }: { initial?: MenuData }) {
  const pathname = usePathname();
  const [data, setData] = useState(initial);
  const chatId = useSyncExternalStore(watchUrl, currentChat, () => null);
  const [open, setOpen] = useState(false);

  // Counts change as she approves things and chats; reload when she moves and when the chat says so.
  useEffect(() => {
    let live = true;
    void fetchMenu().then((d) => live && d && setData(d));
    return () => {
      live = false;
    };
  }, [pathname]);
  useEffect(() => watchUrl(() => void fetchMenu().then((d) => d && setData(d))), []);

  return (
    <>
      {/* The column runs the page's full height; the menu inside stays put while the page scrolls. */}
      <aside className="hidden w-[264px] shrink-0 bg-[var(--menu-bg)] md:block">
        <div className="sticky top-0 h-dvh">
          <MenuBody data={data} chatId={chatId} />
        </div>
      </aside>

      {/* Phone: a top bar whose menu button slides the same menu in from the left. */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--hairline)] bg-[var(--bg)] px-3 py-2 md:hidden">
          <Dialog.Trigger aria-label="Open menu" className="flex size-touch items-center justify-center rounded-full hover:bg-[var(--hairline)]">
            <Menu aria-hidden size={20} />
          </Dialog.Trigger>
          <div className="flex items-center gap-2">
            <Orb size={28} />
            <span className="font-semibold">Aeon</span>
          </div>
          <span aria-hidden className="size-touch" />
        </header>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-[var(--scrim)] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 md:hidden" />
          <Dialog.Popup
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-50 w-[min(88vw,320px)] bg-[var(--menu-bg)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[0_24px_64px_rgb(0_0_0/0.35)] transition-transform duration-[240ms] ease-[var(--ease-soft-out)] outline-none data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full motion-reduce:transition-none md:hidden"
          >
            <Dialog.Close
              aria-label="Close menu"
              className={cn("absolute top-3 right-3 flex size-touch items-center justify-center rounded-full text-[var(--menu-muted)] hover:bg-[var(--menu-hover)]", FOCUS)}
            >
              <X aria-hidden size={20} />
            </Dialog.Close>
            <MenuBody data={data} chatId={chatId} onNavigate={() => setOpen(false)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
