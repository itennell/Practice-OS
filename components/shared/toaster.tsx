"use client";

// Toasts (UI-031): small messages that confirm what just happened or say what
// went wrong ("Text sent to Sam Example", "Couldn't reach Gmail. Reconnect it
// in Settings."). Success fades on its own; errors stay until dismissed and
// name the fix. Announced to screen readers. Raised card look with the
// Status Mark on the left; bottom-right on desktop, top on phones.
// Built on sonner (MIT), as shadcn/ui does.
//
// Mount <Toaster /> once (in the root layout), then call notify.* from anywhere.

import { useSyncExternalStore, type ReactNode } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { StatusMark } from "./status-mark";

const phoneQuery = "(max-width: 639px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(phoneQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function Toaster() {
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(phoneQuery).matches, () => false);
  return (
    <Sonner
      position={phone ? "top-center" : "bottom-right"}
      theme="system"
      gap={10}
      // Always show the whole stack, so a lasting error is never hidden behind newer toasts.
      expand
      visibleToasts={4}
      containerAriaLabel="Notifications"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "tile flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 bg-[var(--toast-bg)]! p-4 pr-3 font-sans text-[var(--fg)]",
          icon: "mt-0.5 shrink-0",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "text-small font-semibold leading-snug",
          description: "text-small leading-snug text-[var(--fg-muted)]",
          actionButton:
            "ml-1 inline-flex h-touch shrink-0 items-center rounded-full bg-[var(--primary-bg)] px-4 text-small font-semibold text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]",
          closeButton:
            "order-last -my-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full border-0! bg-transparent! text-[var(--fg-muted)] hover:bg-[var(--hairline)]! hover:text-[var(--fg)] [&>svg]:size-4",
          error: "border-[var(--danger-fg)]/60",
        },
      }}
      icons={{
        success: <StatusMark status="done" size={18} decorative />,
        error: <StatusMark status="failed" size={18} decorative />,
        loading: <StatusMark status="running" size={18} decorative />,
        info: <StatusMark status="pending" size={18} decorative />,
        warning: <StatusMark status="pending" size={18} decorative />,
      }}
    />
  );
}

type Extra = { description?: ReactNode; action?: { label: string; onClick: () => void } };

/** The ways the app talks through toasts. Messages are plain words; errors say what to do next. */
export const notify = {
  /** "Text sent to Sam Example". Fades after 4 seconds. */
  success: (message: string, extra: Extra = {}) => toast.success(message, { duration: 4000, ...extra }),
  /** "Couldn't reach Gmail." with what to do: "Reconnect it in Settings." Stays until dismissed. */
  error: (message: string, extra: Extra = {}) => toast.error(message, { duration: Infinity, closeButton: true, ...extra }),
  /** Neutral news: "Aeon queued 2 drafts for your approval." */
  info: (message: string, extra: Extra = {}) => toast.info(message, { duration: 5000, ...extra }),
  /** Shows "working", then turns into success or the error, from one promise. */
  working: <T,>(promise: Promise<T>, words: { loading: string; success: string; error: (e: unknown) => string }) =>
    toast.promise(promise, {
      loading: words.loading,
      success: words.success,
      error: (e: unknown) => ({ message: words.error(e), duration: Infinity, closeButton: true }),
    }),
  dismiss: (id?: string | number) => toast.dismiss(id),
};
