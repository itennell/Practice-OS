"use client";

// Side sheet (UI-040): a panel that slides in from the right over the page, for a form
// or a record's details (Admin forms, a Referrals partner, the call script). Base UI
// Dialog: the page behind dims, focus stays inside, Escape closes. Controlled: the
// caller owns `open`. Full width on phones, up to 640px on a wide screen.

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SideSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "max-w-[640px]",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Pinned under the scrolling body (the panel's buttons). */
  footer?: ReactNode;
  /** A Tailwind max-width class. */
  width?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[var(--scrim)] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[var(--glass-line)] bg-[var(--bg)] shadow-[0_24px_64px_rgb(31_30_29/0.18)] transition-transform duration-[240ms] ease-[var(--ease-soft-out)] outline-none data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full motion-reduce:transition-none",
            width,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 md:px-6">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Dialog.Title className="text-section font-semibold break-words">{title}</Dialog.Title>
              {description && <Dialog.Description className="text-small text-[var(--fg-muted)]">{description}</Dialog.Description>}
            </div>
            <Dialog.Close
              aria-label="Close panel"
              className="flex size-touch shrink-0 items-center justify-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--hairline)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
            >
              <X aria-hidden size={20} />
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6">{children}</div>
          {footer && (
            <div className="flex flex-wrap gap-2 border-t border-[var(--hairline)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">{footer}</div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
