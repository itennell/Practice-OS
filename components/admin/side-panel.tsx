"use client";

// A form opens in a panel on the right of Admin, never as the page itself (redesign
// plan, frame 3). The panel lives in the URL (/admin?panel=gfe) so a needs-next button
// or Aeon can link straight to a filled form; closing it goes back to /admin.
// Base UI Dialog: the page behind dims, focus stays inside, Escape closes.

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export function SidePanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.push("/admin", { scroll: false });
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[var(--scrim)] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col border-l border-[var(--glass-line)] bg-[var(--bg)] shadow-[0_24px_64px_rgb(31_30_29/0.18)] transition-transform duration-[240ms] ease-[var(--ease-soft-out)] outline-none data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full motion-reduce:transition-none">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 md:px-6">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Dialog.Title className="text-section font-semibold">{title}</Dialog.Title>
              {description && <Dialog.Description className="text-small text-[var(--fg-muted)]">{description}</Dialog.Description>}
            </div>
            <Dialog.Close
              aria-label="Close panel"
              className="flex size-touch shrink-0 items-center justify-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--hairline)] hover:text-[var(--fg)]"
            >
              <X aria-hidden size={20} />
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
