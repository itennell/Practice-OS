"use client";

// Confirm dialog (UI-028): the "Are you sure?" box for anything permanent or
// risky (deleting files, disconnecting Instagram or Gmail, cancelling a booked
// consult, turning on auto-approve, resetting demo data). Not for approvals:
// those use the approval card.
// Built on shadcn/ui's Alert Dialog pattern over Base UI (MIT). coss ui was the
// visual reference only (AGPL, no code taken).
// The caller writes the confirmed action to audit_log inside onConfirm.

import { useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmDialogProps = {
  /** The button that opens it. Leave out and use `open` / `onOpenChange` to open it from code. */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the action: "Delete 3 files?" */
  title: string;
  /** One or two plain sentences: what happens, and whether it can be undone. */
  description: ReactNode;
  /** Repeats the action: "Delete 3 files". Never "OK" or "Yes". */
  confirmLabel: string;
  /** For the most serious actions: she types this (e.g. the practice name) before the button unlocks. */
  typeToConfirm?: string;
  /** Runs the action. Throw to keep the dialog open and show the message. */
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  typeToConfirm,
  onConfirm,
}: ConfirmDialogProps) {
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();

  const setOpen = (next: boolean) => {
    if (busy) return;
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  };

  const unlocked = !typeToConfirm || typed.trim() === typeToConfirm;

  const confirm = async () => {
    if (!unlocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      setOpen(false);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "That didn't work. Nothing was changed.");
    }
  };

  return (
    <AlertDialog.Root open={isOpen} onOpenChange={setOpen}>
      {trigger && <AlertDialog.Trigger render={trigger} />}
      <AlertDialog.Portal>
        <AlertDialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[2px] transition-opacity duration-200 ease-[var(--ease-calm)]",
            "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none",
          )}
        />
        <AlertDialog.Popup
          initialFocus={cancelRef}
          className={cn(
            // Phones: a sheet at the bottom of the screen. Wider: centred card.
            "fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-[var(--radius-card)] border border-[var(--glass-line)] bg-[var(--glass-strong)] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[var(--fg)] shadow-[0_24px_64px_rgb(23_20_43/0.18)] backdrop-blur-[var(--blur-glass)] outline-none",
            "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-card)] sm:pb-6",
            "transition-[opacity,transform] duration-200 ease-[var(--ease-soft-out)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            "data-[starting-style]:translate-y-4 data-[ending-style]:translate-y-4 sm:data-[starting-style]:-translate-y-[calc(50%-0.5rem)] sm:data-[ending-style]:-translate-y-[calc(50%-0.5rem)]",
            "motion-reduce:transition-none",
          )}
        >
          <AlertDialog.Title className="text-section font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-body text-[var(--fg-muted)]">{description}</AlertDialog.Description>

          {typeToConfirm && (
            <div className="flex flex-col gap-2">
              <label htmlFor={inputId} className="text-small font-medium">
                Type <span className="font-semibold">{typeToConfirm}</span> to confirm
              </label>
              <input
                id={inputId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="h-input rounded-full border border-[var(--fg-muted)] bg-[var(--chip-off-bg)] px-5 text-body text-[var(--fg)]"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
              {error}
            </p>
          )}

          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AlertDialog.Close
              ref={cancelRef}
              disabled={busy}
              className="inline-flex h-touch items-center justify-center rounded-full border border-border bg-[var(--chip-off-bg)] px-6 text-body font-medium text-[var(--fg)] transition-colors duration-150 hover:border-accent disabled:opacity-50"
            >
              Cancel
            </AlertDialog.Close>
            <button
              type="button"
              onClick={confirm}
              disabled={!unlocked || busy}
              aria-busy={busy || undefined}
              className="inline-flex h-touch items-center justify-center rounded-full bg-[var(--danger-bg)] px-6 text-body font-semibold text-[var(--danger-on)] transition-colors duration-150 hover:bg-[var(--danger-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
