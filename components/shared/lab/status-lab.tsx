"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui";
import { STATUS_WORDS, StatusMark, StatusPill, type Status } from "../status-mark";

const ALL: Status[] = ["pending", "running", "done", "failed", "declined"];

export default function StatusLab() {
  const [status, setStatus] = useState<Status>("pending");
  const [progress, setProgress] = useState(0.4);

  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <h2 className="label-caps">Every status</h2>
        <ul className="mt-5 flex flex-wrap gap-3">
          {ALL.map((s) => (
            <li key={s}>
              <StatusPill status={s} />
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">Watch it change</h2>
        <div role="group" aria-label="Status" className="mt-5 flex flex-wrap gap-2">
          {ALL.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={`inline-flex h-touch items-center rounded-full px-5 text-small font-medium transition-colors duration-150 ${
                status === s
                  ? "bg-[var(--primary-bg)] text-[var(--primary-fg)]"
                  : "border border-border bg-[var(--chip-off-bg)] text-[var(--fg)] hover:border-accent"
              }`}
            >
              {STATUS_WORDS[s]}
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <StatusMark status={status} size={40} />
          <StatusMark status={status} size={24} />
          <StatusPill status={status} />
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">Progress</h2>
        <p className="mt-2 text-small text-[var(--fg-muted)]">While running, a known amount of progress fills the ring instead of spinning.</p>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <StatusMark status="running" progress={progress} size={40} />
          <label className="flex items-center gap-3 text-small">
            <span>Progress</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(progress * 100)}
              onChange={(e) => setProgress(Number(e.target.value) / 100)}
              className="h-touch w-48 accent-[var(--accent-fg)]"
            />
          </label>
        </div>
      </GlassCard>
    </div>
  );
}
