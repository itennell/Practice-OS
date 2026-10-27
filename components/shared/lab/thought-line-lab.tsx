"use client";

import { useEffect, useRef, useState } from "react";
import { Button, GlassCard } from "@/components/ui";
import { ThoughtLine } from "../thought-line";

// Sample job progress, the way real jobs will report it: plain-words summaries, one at a time.
const JOB = [
  "[Sample] Read your practice details",
  "[Sample] Checked which topics you posted last month",
  "[Sample] Drafted 3 posts about first sessions, fees and booking",
  "[Sample] Checked each draft against the posting rules",
];

export default function ThoughtLineLab() {
  const [steps, setSteps] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = () => {
    if (timer.current) clearInterval(timer.current);
    let i = 0;
    setSteps([JOB[0]]);
    setWorking(true);
    timer.current = setInterval(() => {
      i += 1;
      if (i < JOB.length) setSteps(JOB.slice(0, i + 1));
      else {
        setWorking(false);
        if (timer.current) clearInterval(timer.current);
      }
    }, 900);
  };

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  return (
    <div className="space-y-6">
      <GlassCard className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="label-caps">Aeon drafting posts</h2>
          <Button variant="quiet" onClick={run} disabled={working}>
            {steps.length ? "Run again" : "Start"}
          </Button>
        </div>
        {steps.length > 0 ? (
          <ThoughtLine working={working} label="Drafting posts…" doneLabel="Drafted 3 posts" steps={steps} />
        ) : (
          <p className="text-small text-[var(--fg-muted)]">Press Start to watch Aeon work through a sample job.</p>
        )}
      </GlassCard>

      <GlassCard className="flex flex-col gap-4 p-6">
        <h2 className="label-caps">Other states</h2>
        <ThoughtLine working label="Thinking…" />
        <ThoughtLine working={false} doneLabel="Found 4 referral sources near Lincoln Park" showTimer={false} />
      </GlassCard>
    </div>
  );
}
