"use client";

import { GlassCard } from "@/components/ui";
import { Avatar } from "../avatar";

const CALLERS = ["[Sample] Sam Example", "[Sample] Jordan Lee", "[Sample] Priya Patel", "[Sample] Lakeview Family Medicine", "(312) 555-0142"];

export default function AvatarLab() {
  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <h2 className="label-caps">The clinician</h2>
        <p className="mt-2 text-small text-[var(--fg-muted)]">
          Initials until her photo exists. Her demo photo will be the muse-image headshot, never a stock or real photo.
        </p>
        <ul className="mt-5 flex flex-wrap items-end gap-8">
          {(["sm", "md", "lg"] as const).map((size) => (
            <li key={size} className="flex flex-col items-center gap-2">
              <Avatar name="Dana Reyes, LCPC" tone="lilac" size={size} />
              <span className="text-small text-[var(--fg-muted)]">{size === "sm" ? "32px lists" : size === "md" ? "40px sidebar" : "72px settings"}</span>
            </li>
          ))}
          <li className="flex flex-col items-center gap-2">
            <Avatar name="Dana Reyes, LCPC" tone="lilac" size="lg" status="connected" />
            <span className="text-small text-[var(--fg-muted)]">with a status dot</span>
          </li>
        </ul>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">Sidebar footer</h2>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name="Dana Reyes, LCPC" tone="lilac" />
          <div className="leading-tight">
            <p className="font-semibold">Dana Reyes, LCPC</p>
            <p className="text-small text-[var(--fg-muted)]">Fictional demo practice</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">Callers and contacts</h2>
        <p className="mt-2 text-small text-[var(--fg-muted)]">Initials only, in a tone picked from the name. No name, no initials: a person icon.</p>
        <ul className="mt-4 flex flex-col gap-3">
          {CALLERS.map((n) => (
            <li key={n} className="flex items-center gap-3">
              <Avatar name={n} size="sm" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">A photo that fails to load</h2>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name="[Sample] Alex Kim" src="/missing-photo.jpg" />
          <span className="text-small text-[var(--fg-muted)]">Falls back to initials.</span>
        </div>
      </GlassCard>
    </div>
  );
}
