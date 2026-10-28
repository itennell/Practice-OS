"use client";

// Settings → Aeon (UI-008, Agent profile page, Aeon only): Aeon's Soul and
// Memory as two cards, each opening a read-only sheet. Nothing here can be
// edited; she changes a memory by telling Aeon in chat (AGENTS.md > Aeon's
// memory). The sheet follows the Confirm dialog's shape (UI-028): a bottom
// sheet on phones, a centred card on wider screens, on Base UI's Dialog.

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Heart, MessageSquare, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Orb } from "./ui";
import { cn } from "@/lib/utils";

export type AeonFile = {
  id: "soul" | "memory";
  title: string;
  subtitle: string;
  /** YYYY-MM-DD, or null when there is nothing yet. */
  updated: string | null;
  text: string;
};

const LOOK: Record<AeonFile["id"], { icon: LucideIcon; card: string; warning: string }> = {
  soul: {
    icon: Heart,
    card: "bg-[radial-gradient(circle_at_80%_110%,var(--color-front-desk-from),transparent_55%),linear-gradient(140deg,var(--color-front-desk-to),var(--color-aeon-4))]",
    warning: "This is who Aeon is and the rules it never breaks. It is part of Practice-OS, so it isn't changed here.",
  },
  memory: {
    icon: MessageSquare,
    card: "bg-[radial-gradient(circle_at_85%_110%,var(--color-instagram-from),transparent_55%),linear-gradient(140deg,var(--color-referrals-to),var(--color-instagram-to))]",
    warning: "This is how Aeon understands your practice. To change something, tell Aeon in chat.",
  },
};

/** 2026-10-27 → 10.27.26, the date style on the cards. */
function cardDate(day: string | null): string {
  if (!day) return "Nothing yet";
  const [y, m, d] = day.split("-");
  return `${m}.${d}.${y.slice(2)}`;
}

export function AeonFiles({ files, usage }: { files: AeonFile[]; usage: string }) {
  const [open, setOpen] = useState<AeonFile["id"] | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const shown = files.find((f) => f.id === open) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Orb size={56} />
        <div className="flex flex-col">
          <span className="text-section font-semibold">Aeon</span>
          <span className="text-small text-[var(--fg-muted)]">Remembers practice facts automatically after each chat</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {files.map((f) => {
          const look = LOOK[f.id];
          const Icon = look.icon;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setOpen(f.id)}
              aria-label={`Open ${f.title} (read only)`}
              className={cn(
                "group relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-[var(--radius-card-sm)] p-5 text-left text-white",
                "shadow-[0_10px_30px_-10px_rgb(43_33_110/0.45)] transition-transform duration-200 ease-[var(--ease-soft-out)] hover:-translate-y-0.5",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-fg)] motion-reduce:transition-none",
                look.card,
              )}
            >
              <span className="flex flex-col gap-1">
                <span className="text-[1.6rem] leading-none font-bold tracking-tight uppercase">{f.title}</span>
                <span className="font-mono text-label tracking-[0.18em] uppercase">Handle with care</span>
              </span>
              <span className="flex items-end justify-between">
                <span className="font-mono text-body">{cardDate(f.updated)}</span>
                <Icon aria-hidden className="size-7 fill-white/80 stroke-white/80" />
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-small text-[var(--fg-muted)]">{usage}</p>

      <Dialog.Root open={shown !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop
            className={cn(
              "fixed inset-0 z-50 bg-[var(--scrim)] transition-opacity duration-200 ease-[var(--ease-calm)]",
              "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none",
            )}
          />
          <Dialog.Popup
            initialFocus={closeRef}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col gap-4 rounded-t-[var(--radius-card)] border border-[var(--glass-line)] bg-[var(--glass-strong)] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--fg)] shadow-[0_24px_64px_rgb(23_20_43/0.18)] outline-none",
              "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[min(40rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-card)] sm:pb-6",
              "transition-[opacity,transform] duration-200 ease-[var(--ease-soft-out)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
              "data-[starting-style]:translate-y-4 data-[ending-style]:translate-y-4 motion-reduce:transition-none",
            )}
          >
            {shown && (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Dialog.Title className="text-section font-semibold">{shown.title}</Dialog.Title>
                    <Dialog.Description className="text-small text-[var(--fg-muted)]">
                      {shown.subtitle} · Read only
                    </Dialog.Description>
                  </div>
                  <Dialog.Close
                    ref={closeRef}
                    aria-label="Close"
                    className="inline-flex size-touch shrink-0 items-center justify-center rounded-full border border-border bg-[var(--chip-off-bg)] text-[var(--fg)] transition-colors duration-150 hover:border-accent"
                  >
                    <X aria-hidden className="size-5" />
                  </Dialog.Close>
                </div>
                <pre
                  tabIndex={0}
                  aria-label={`${shown.title} contents`}
                  className="tile min-h-0 flex-1 overflow-auto rounded-[var(--radius-card-sm)] p-4 font-sans text-small leading-relaxed whitespace-pre-wrap"
                >
                  {shown.text}
                </pre>
                <p
                  role="note"
                  className="flex items-start gap-3 rounded-[var(--radius-card-sm)] border border-[var(--tile-error-line)] bg-[var(--danger-bg)]/10 p-4 text-small"
                >
                  <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--danger-fg)]" />
                  <span>
                    <strong className="font-semibold">Handle with care. </strong>
                    {LOOK[shown.id].warning}
                  </span>
                </p>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
