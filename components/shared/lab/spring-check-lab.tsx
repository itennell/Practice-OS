"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui";
import { SpringCheck } from "../spring-check";

const STEPS = [
  "[Sample] Log 3 CE hours for the license renewal",
  "[Sample] Re-attest CAQH",
  "[Sample] Follow up with Lakeview Family Medicine",
  "[Sample] Pay Q4 estimated tax",
];

export default function SpringCheckLab() {
  const [done, setDone] = useState<boolean[]>([false, true, false, false]);
  const count = done.filter(Boolean).length;

  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <h2 className="label-caps">A checklist</h2>
        <p className="mt-2 text-small text-[var(--fg-muted)]" aria-live="polite">
          {count} of {STEPS.length} done
        </p>
        <ul className="mt-4 flex flex-col gap-1">
          {STEPS.map((step, i) => (
            <li key={step}>
              <SpringCheck
                label={step}
                checked={done[i]}
                onChange={(next) => setDone((d) => d.map((v, j) => (j === i ? next : v)))}
              />
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">Other states</h2>
        <ul className="mt-4 flex flex-col gap-1">
          <li>
            <SpringCheck label="[Sample] Without a cross-out" defaultChecked strike={false} />
          </li>
          <li>
            <SpringCheck label="[Sample] Disabled" disabled />
          </li>
        </ul>
      </GlassCard>
    </div>
  );
}
