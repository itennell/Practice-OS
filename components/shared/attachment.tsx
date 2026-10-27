"use client";

// Attachment (UI-023): a card for an image or file with a preview, name,
// details and small actions, in a scrolling row. Main spot: the Instagram
// post composer (generating with muse-image, converting to JPEG, ready, or
// blocked with the reason). Also files in the chat and payer PDF forms, so
// files look the same everywhere.
// Follows shadcn/ui's Attachment structure (MIT), in the Caseload look.

import type { ReactNode } from "react";
import { AudioLines, ExternalLink, File, FileText, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusMark } from "./status-mark";

export type AttachmentState = "uploading" | "processing" | "error" | "done";
export type AttachmentKind = "image" | "pdf" | "audio" | "file";

const KIND_ICON = { image: ImageIcon, pdf: FileText, audio: AudioLines, file: File } as const;

export type AttachmentProps = {
  name: string;
  /** "JPEG · 412 KB". While working, say what is happening instead: "Converting to JPEG…". */
  details?: string;
  state?: AttachmentState;
  /** Why it failed, in plain words: "Blocked: mentions self-harm". Shown instead of details. */
  error?: string;
  kind?: AttachmentKind;
  /** Image preview URL. */
  previewSrc?: string;
  /** Shows a remove button named "Remove {name}". */
  onRemove?: () => void;
  /** Shows an open link named "Open {name}". */
  href?: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export function Attachment({
  name,
  details,
  state = "done",
  error,
  kind = "file",
  previewSrc,
  onRemove,
  href,
  orientation = "horizontal",
  className,
}: AttachmentProps) {
  const Icon = KIND_ICON[kind];
  const working = state === "uploading" || state === "processing";
  const vertical = orientation === "vertical";

  return (
    <div
      data-state={state}
      className={cn(
        "tile group relative flex min-w-0 shrink-0 p-2 text-[var(--fg)]",
        "transition-[box-shadow,transform] duration-200 ease-[var(--ease-soft-out)] hover:shadow-[var(--tile-shadow-hover)] motion-safe:hover:-translate-y-px",
        state === "error" && "border-[var(--tile-error-line)]! shadow-[var(--tile-error-shadow)]!",
        vertical ? "w-[clamp(8rem,38vw,9.5rem)] flex-col gap-2" : "w-[clamp(15rem,78vw,21rem)] max-w-full items-center gap-3",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[var(--hairline)]",
          vertical ? "aspect-square w-full" : "size-12",
          state === "error" && "bg-[var(--status-failed-bg)] text-[var(--danger-fg)]",
        )}
      >
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- previews are local blobs and generated files, not optimisable assets
          <img src={previewSrc} alt="" className={cn("size-full object-cover", working && "opacity-60")} />
        ) : (
          !working && <Icon aria-hidden size={vertical ? 28 : 20} />
        )}
        {working && (
          <span className="absolute inset-0 grid place-items-center">
            <StatusMark status="running" size={vertical ? 28 : 20} decorative />
          </span>
        )}
      </div>

      <div className={cn("min-w-0 flex-1 leading-tight", vertical && "px-1 pb-1")}>
        <span title={name} className={cn("block truncate text-small font-semibold", working && "shimmer-text")}>
          {name}
        </span>
        <span
          aria-live="polite"
          className={cn(
            "mt-0.5 flex min-w-0 gap-1 text-label",
            state === "error" ? "items-start font-medium text-[var(--danger-fg)]" : "items-center text-[var(--fg-muted)]",
          )}
        >
          {state === "error" && <StatusMark status="failed" size={12} decorative className="mt-[0.15em]" />}
          <span className={cn(state !== "error" && "truncate")}>{state === "error" ? (error ?? "Failed") : details}</span>
        </span>
      </div>

      {(onRemove || href) && (
        <div
          className={cn(
            "flex shrink-0 items-center",
            vertical && "absolute top-3 right-3 gap-1 *:bg-[var(--glass-strong)] *:text-[var(--fg)] *:backdrop-blur-sm",
          )}
        >
          {href && (
            <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${name}`} className={ACTION}>
              <ExternalLink aria-hidden size={16} />
            </a>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className={ACTION}>
              <X aria-hidden size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ACTION =
  "inline-flex size-11 items-center justify-center rounded-full text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--hairline)] hover:text-[var(--fg)]";

/** A scrolling row of attachments, read as a list. */
export function AttachmentList({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    // Padding leaves room for the cards' shadows, which the scrolling row would otherwise clip.
    <ul aria-label={label} className={cn("-mx-2 -mt-1 -mb-6 flex min-w-0 snap-x gap-3 overflow-x-auto overscroll-x-contain px-2 pt-2 pb-8 [scrollbar-color:var(--fg-muted)_transparent] [scrollbar-width:thin]", className)}>
      {Array.isArray(children) ? children.map((c, i) => <li key={i} className="flex-none snap-start">{c}</li>) : <li className="flex-none">{children}</li>}
    </ul>
  );
}
