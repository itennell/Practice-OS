"use client";

// Avatar (UI-029): a round profile picture with initials while it loads or
// when there is no photo. The clinician's picture sits at the bottom of the
// sidebar; callers and referral contacts get initials only, never photos.
// Built on shadcn/ui's Avatar pattern over Base UI (MIT). coss ui was the
// visual reference only (AGPL, no code taken).
// Dana's demo photo must be the muse-image-1.0 headshot, never a stock or real photo.

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials, toneFor, type AvatarTone } from "./avatar-initials";

const SIZES = {
  sm: { box: 32, text: "text-[0.75rem]", icon: 16, dot: 9 },
  md: { box: 40, text: "text-[0.875rem]", icon: 20, dot: 11 },
  lg: { box: 72, text: "text-[1.5rem]", icon: 32, dot: 16 },
} as const;

export type AvatarProps = {
  /** The person's name. It is the avatar's accessible name and the source of its initials. */
  name: string;
  /** Photo URL. Leave out for callers and contacts. */
  src?: string;
  /** 32px lists, 40px sidebar, 72px settings. */
  size?: keyof typeof SIZES;
  /** Defaults to a tone picked from the name. The clinician uses lilac. */
  tone?: AvatarTone;
  /** A small green dot, with what it means (e.g. "connected"). */
  status?: string;
  className?: string;
};

export function Avatar({ name, src, size = "md", tone, status, className }: AvatarProps) {
  const s = SIZES[size];
  const t = tone ?? toneFor(name);
  const letters = initials(name);
  const label = status ? `${name}, ${status}` : name;

  return (
    <span role="img" aria-label={label} className={cn("relative inline-flex shrink-0", className)} style={{ width: s.box, height: s.box }}>
      <AvatarPrimitive.Root
        className="inline-flex size-full items-center justify-center overflow-hidden rounded-full shadow-[0_0_0_2px_var(--avatar-ring)] select-none"
        style={{ background: `var(--avatar-${t}-bg)`, color: `var(--avatar-${t}-fg)` }}
      >
        {src && <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" />}
        <AvatarPrimitive.Fallback delay={src ? 400 : 0} className={cn("font-semibold tracking-wide", s.text)}>
          {letters || <User aria-hidden size={s.icon} strokeWidth={2} />}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
      {status && (
        <span
          aria-hidden
          className="absolute right-0 bottom-0 rounded-full bg-success shadow-[0_0_0_2px_var(--avatar-ring)]"
          style={{ width: s.dot, height: s.dot }}
        />
      )}
    </span>
  );
}
