"use client";

import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown, Hand, ShieldOff, Sparkles } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { APPROVAL_MODES, MODE_INFO, type ApprovalMode } from "@/lib/approval-modes";

// The mode pill under the chat box, left, as in a coding agent: Manual, Auto,
// Bypass. Clicking it opens a small box of choices; Shift+Tab in the message
// box cycles them (wired in AeonChat). Bypass asks first. Whatever the mode,
// anything handed to a client still waits for her (lib/approval-policy.ts).

const ICON = { manual: Hand, auto: Sparkles, bypass: ShieldOff } as const;

export function nextMode(mode: ApprovalMode): ApprovalMode {
  return APPROVAL_MODES[(APPROVAL_MODES.indexOf(mode) + 1) % APPROVAL_MODES.length];
}

export function ModePicker({
  mode,
  onChange,
  readOnly = false,
}: {
  mode: ApprovalMode;
  /** Resolves once saved; throw to keep the old mode. */
  onChange: (mode: ApprovalMode) => void | Promise<void>;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [askBypass, setAskBypass] = useState(false);
  const Icon = ICON[mode];

  const pick = (m: ApprovalMode) => {
    setOpen(false);
    if (m === mode) return;
    if (m === "bypass") setAskBypass(true);
    else void onChange(m);
  };

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          disabled={readOnly}
          aria-label={`Mode: ${MODE_INFO[mode].label}. ${readOnly ? "View only." : "Change mode"}`}
          className="inline-flex h-touch items-center gap-2 rounded-full border border-border bg-[var(--chip-off-bg)] px-4 text-small font-medium text-[var(--fg)] outline-none hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-default disabled:hover:border-border"
        >
          <Icon aria-hidden className="size-4" />
          {MODE_INFO[mode].label}
          {!readOnly && <ChevronDown aria-hidden className="size-4 text-[var(--fg-muted)]" />}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" align="start" sideOffset={8} className="z-50">
            <Popover.Popup className="glass w-[min(20rem,calc(100vw-2rem))] rounded-[20px] p-2 shadow-lg outline-none">
              <Popover.Title className="px-3 pb-1 pt-2 text-small font-semibold text-[var(--fg-muted)]">How Aeon works in this chat</Popover.Title>
              <ul role="list" className="flex flex-col">
                {APPROVAL_MODES.map((m) => {
                  const I = ICON[m];
                  return (
                    <li key={m}>
                      <button
                        type="button"
                        aria-pressed={m === mode}
                        onClick={() => pick(m)}
                        className="flex min-h-touch w-full items-start gap-3 rounded-[14px] px-3 py-2.5 text-left outline-none hover:bg-[var(--hairline)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        <I aria-hidden className="mt-0.5 size-4 shrink-0" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-medium text-[var(--fg)]">{MODE_INFO[m].label}</span>
                          <span className="text-small text-[var(--fg-muted)]">{MODE_INFO[m].line}</span>
                        </span>
                        {m === mode && <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--accent-fg)]" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="px-3 pb-2 pt-1 text-small text-[var(--fg-muted)]">
                Shift+Tab in the message box switches. Anything for a client always waits for you.
              </p>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <ConfirmDialog
        open={askBypass}
        onOpenChange={setAskBypass}
        title="Switch this chat to Bypass?"
        description="Aeon will do everything it can on its own here, including public posts and outreach drafts, without asking. Superbills, estimates, release forms and anything for a client still wait for you. You can switch back any time."
        confirmLabel="Switch to Bypass"
        onConfirm={() => onChange("bypass")}
      />
    </>
  );
}
