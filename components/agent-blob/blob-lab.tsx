"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui";
import AgentBlob from "./agent-blob";
import type { BlobMaterial } from "./blob-canvas";
import { AGENT_NAMES, type Agent, type Steady } from "./motion";

const AGENTS: Agent[] = ["aeon", "front-desk", "referrals", "instagram"];
const MATERIALS: { id: BlobMaterial; name: string }[] = [
  { id: "liquid", name: "Liquid metal" },
  { id: "chrome", name: "Chrome" },
  { id: "jelly", name: "Jelly" },
];

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-touch items-center rounded-full px-5 text-small font-medium transition-colors duration-150 ${
        on
          ? "bg-[var(--primary-bg)] text-[var(--primary-fg)]"
          : "border border-border bg-[var(--chip-off-bg)] text-[var(--fg)] hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

export default function BlobLab() {
  const [state, setState] = useState<Steady>("rest");
  const [material, setMaterial] = useState<BlobMaterial>("liquid");
  const [splash, setSplash] = useState(0);

  return (
    <div className="space-y-6">
      <GlassCard className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
        <div role="group" aria-label="What Aeon is doing" className="flex flex-wrap gap-2">
          <Toggle on={state === "rest"} onClick={() => setState("rest")}>
            Resting
          </Toggle>
          <Toggle on={state === "work"} onClick={() => setState("work")}>
            Working
          </Toggle>
          <button
            type="button"
            onClick={() => setSplash((n) => n + 1)}
            className="inline-flex h-touch items-center rounded-full bg-accent px-5 text-small font-semibold text-white transition-colors duration-150 hover:bg-accent-hover"
          >
            Pop up again
          </button>
        </div>
        <div role="group" aria-label="Surface" className="flex flex-wrap gap-2">
          {MATERIALS.map((m) => (
            <Toggle key={m.id} on={material === m.id} onClick={() => setMaterial(m.id)}>
              {m.name}
            </Toggle>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="flex flex-col items-center gap-4 px-6 py-12">
        <AgentBlob agent="aeon" state={state} splashKey={splash} size={220} material={material} />
        <p className="text-small text-[var(--fg-muted)]" aria-live="polite">
          Aeon, {state === "work" ? "working" : "resting"}
        </p>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">The four agents</h2>
        <ul className="mt-6 grid grid-cols-2 gap-8 sm:grid-cols-4">
          {AGENTS.map((a) => (
            <li key={a} className="flex flex-col items-center gap-3">
              <AgentBlob agent={a} state={state} splashKey={splash} size={104} material={material} />
              <span className="text-small font-medium">{AGENT_NAMES[a]}</span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">Reduced motion and small sizes</h2>
        <p className="mt-2 text-small text-[var(--fg-muted)]">
          When someone turns on reduced motion, or the browser has no WebGL, each blob becomes this still orb. Sidebar and list
          orbs always use it.
        </p>
        <ul className="mt-6 flex flex-wrap gap-8">
          {AGENTS.map((a) => (
            <li key={a} className="flex flex-col items-center gap-3">
              <AgentBlob agent={a} still size={56} />
              <span className="text-small font-medium">{AGENT_NAMES[a]}</span>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
