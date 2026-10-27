"use client";

// Aeon droplets: a tiny chrome Aeon for places too small for the live blob
// (Thought Line, inline status). While working, four chrome droplets dance
// out, splash and melt back together; when done they merge into one still
// orb. Isaiah's pick (2026-10-27): the chrome Liquid Aeon look, small.
// Drawn in SVG with a "gooey" filter (blur, then sharpen the edge), so it
// costs no WebGL canvas. Reduced motion: one still orb.

import { useId } from "react";
import { cn } from "@/lib/utils";

export function AeonDroplets({ working = true, className }: { working?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const chrome = `${id}-chrome`;
  const goo = `${id}-goo`;

  return (
    <svg
      aria-hidden
      viewBox="0 0 40 40"
      className={cn("aeon-droplets size-[1.85em] shrink-0 overflow-visible", working && "is-working", className)}
    >
      <defs>
        {/* Chrome tinted with Aeon's gradient: white highlight, lilac, a cool metal band, violet to blue rim. */}
        <radialGradient id={chrome} cx="36%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="22%" stopColor="#e3d9ff" />
          <stop offset="42%" stopColor="#a9a6c4" />
          <stop offset="58%" stopColor="#c9c2f2" />
          <stop offset="78%" stopColor="#8e7cf8" />
          <stop offset="100%" stopColor="#4e69da" />
        </radialGradient>
        <filter id={goo} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
      <g filter={`url(#${goo})`} fill={`url(#${chrome})`}>
        <circle className="drop-core" cx="20" cy="20" r="9.5" />
        <circle className="drop drop-a" cx="20" cy="20" r="5.2" />
        <circle className="drop drop-b" cx="20" cy="20" r="4.6" />
        <circle className="drop drop-c" cx="20" cy="20" r="4.9" />
        <circle className="drop drop-d" cx="20" cy="20" r="4.2" />
      </g>
    </svg>
  );
}
