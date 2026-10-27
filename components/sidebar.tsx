"use client";

import { BookOpen, CalendarClock, Camera, House, Inbox, Menu, Phone, Settings, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import { Orb } from "./ui";

type NavItem = { href: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }> };

const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/approvals", label: "Approvals", icon: Inbox },
  { href: "/deadlines", label: "Deadlines", icon: CalendarClock },
  { href: "/how-do-i", label: "How do I", icon: BookOpen },
  { href: "/referrals", label: "Referrals", icon: Users },
  { href: "/instagram", label: "Instagram", icon: Camera },
  { href: "/front-desk", label: "Front Desk", icon: Phone },
];

function NavLink({ href, label, icon: Icon, onNavigate }: NavItem & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex h-touch items-center gap-3 rounded-full px-4 text-body font-medium transition-colors duration-150 ${
        active
          ? "bg-[var(--primary-bg)] text-[var(--primary-fg)]"
          : "text-[var(--fg-muted)] hover:bg-[var(--glass-strong)] hover:text-[var(--fg)]"
      }`}
    >
      <Icon aria-hidden size={18} strokeWidth={1.75} />
      {label}
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <ul className="flex flex-col gap-1">
        {NAV.map((item) => (
          <li key={item.href}>
            <NavLink {...item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-4">
        <NavLink href="/settings" label="Settings" icon={Settings} onNavigate={onNavigate} />
      </div>
    </>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop: 240px glass sidebar (board: light sidebar 240px). */}
      <nav
        aria-label="Main"
        className="glass sticky top-4 m-4 hidden h-[calc(100vh-2rem)] w-[240px] shrink-0 flex-col p-4 md:flex"
      >
        <div className="flex items-center gap-3 px-2 pb-6 pt-2">
          <Orb size={40} />
          <div>
            <p className="font-semibold leading-tight">Aeon</p>
            <p className="text-small text-[var(--fg-muted)]">Practice co-owner</p>
          </div>
        </div>
        <NavList />
      </nav>

      {/* Phone: top bar with a menu button. */}
      <header className="glass sticky top-0 z-20 m-3 flex items-center justify-between px-4 py-2 md:hidden">
        <div className="flex items-center gap-3">
          <Orb size={32} />
          <span className="font-semibold">Aeon</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className="flex size-touch items-center justify-center rounded-full hover:bg-[var(--glass-strong)]"
        >
          {open ? <X aria-hidden size={20} /> : <Menu aria-hidden size={20} />}
        </button>
      </header>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="glass mx-3 mb-3 flex flex-col p-3 md:hidden">
          <NavList onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </>
  );
}
