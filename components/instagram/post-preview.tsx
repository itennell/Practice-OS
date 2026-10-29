"use client";

// A post as it will look in the Instagram feed (our own markup; no Instagram
// logo or assets): her profile row, the 4:5 picture, the action row, and the
// caption under it, cut after about two lines with "more", like the app.

import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Avatar } from "../shared/avatar";

export type PreviewProfile = { practiceName: string; place: string | null; isSample: boolean };

/** About what Instagram shows before "more" on a phone. */
const SHORT = 125;

export function shortCaption(caption: string): { text: string; cut: boolean } {
  const firstBlock = caption.split("\n")[0];
  if (caption.length <= SHORT && firstBlock === caption) return { text: caption, cut: false };
  const head = firstBlock.length <= SHORT ? firstBlock : firstBlock.slice(0, SHORT).replace(/\s+\S*$/, "");
  return { text: head.replace(/[\s.,;:!?…]+$/, ""), cut: true };
}

export function PostPreview({
  profile,
  imageSrc,
  altText,
  caption,
  headingId,
  children,
}: {
  profile: PreviewProfile;
  imageSrc: string | null;
  altText: string | null;
  caption: string;
  /** The id the surrounding card is labelled by. */
  headingId: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const captionId = useId();
  const { text, cut } = shortCaption(caption);
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)]">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Avatar name={profile.practiceName} size="sm" tone="lilac" />
        <div className="min-w-0 flex-1 leading-tight">
          <p id={headingId} className="truncate text-small font-semibold text-[var(--fg)]">
            {profile.isSample && <span className="mr-1 font-normal text-[var(--fg-muted)]">[Sample]</span>}
            {profile.practiceName}
          </p>
          {profile.place && <p className="truncate text-label text-[var(--fg-muted)]">{profile.place}</p>}
        </div>
        <MoreHorizontal aria-hidden size={20} className="text-[var(--fg)]" />
      </div>
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private, per-post JPEG from our own route
        <img src={imageSrc} alt={altText ?? ""} width={1080} height={1350} className="aspect-[4/5] w-full bg-[var(--hairline)] object-cover" />
      ) : (
        <div aria-hidden className="aspect-[4/5] w-full bg-[var(--hairline)]" />
      )}
      <div aria-hidden className="flex items-center gap-4 px-3 pt-3 text-[var(--fg)]">
        <Heart size={24} strokeWidth={1.75} />
        <MessageCircle size={24} strokeWidth={1.75} />
        <Send size={24} strokeWidth={1.75} />
        <Bookmark size={24} strokeWidth={1.75} className="ml-auto" />
      </div>
      <div className="px-3 pt-2 pb-3 text-small text-[var(--fg)]">
        <p id={captionId} className="whitespace-pre-line break-words">
          <span className="font-semibold">{profile.practiceName}</span> {open || !cut ? caption : text}
          {cut && !open && (
            <>
              {"… "}
              <button
                type="button"
                aria-expanded={false}
                aria-controls={captionId}
                onClick={() => setOpen(true)}
                className="relative text-[var(--fg-muted)] after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[''] hover:text-[var(--fg)]"
              >
                more<span className="sr-only"> of the caption</span>
              </button>
            </>
          )}
        </p>
      </div>
      {children}
    </div>
  );
}
