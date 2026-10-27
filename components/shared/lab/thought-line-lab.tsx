"use client";

import { useEffect, useRef, useState } from "react";
import { Button, GlassCard } from "@/components/ui";
import { ThoughtLine } from "../thought-line";

// A sample job reported the way real jobs will: a short plan of tasks up front,
// each ticked off as it finishes. One short line per task.
const PLAN = ["[Sample] Read your practice details", "[Sample] Checked last month's posts", "[Sample] Drafted 3 posts", "[Sample] Checked the posting rules"];

export default function ThoughtLineLab() {
  const [at, setAt] = useState(-1); // index of the task in progress; -1 not started; PLAN.length finished
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const working = at >= 0 && at < PLAN.length;

  const run = () => {
    if (timer.current) clearInterval(timer.current);
    setAt(0);
    timer.current = setInterval(() => {
      setAt((i) => {
        if (i + 1 >= PLAN.length && timer.current) clearInterval(timer.current);
        return i + 1;
      });
    }, 1300);
  };

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const steps = PLAN.map((label, i) => ({
    label,
    status: i < at ? ("done" as const) : i === at ? ("running" as const) : ("pending" as const),
  }));

  return (
    <div className="space-y-6">
      <GlassCard className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="label-caps">Aeon drafting posts</h2>
          <Button variant="quiet" onClick={run} disabled={working}>
            {at >= 0 ? "Run again" : "Start"}
          </Button>
        </div>
        {at >= 0 ? (
          <ThoughtLine working={working} label="Drafting posts…" doneLabel="Drafted 3 posts" steps={steps} />
        ) : (
          <p className="text-small text-[var(--fg-muted)]">Press Start to watch Aeon work through a sample job.</p>
        )}
      </GlassCard>

      <GlassCard className="flex flex-col gap-4 p-6">
        <h2 className="label-caps">When a task doesn&apos;t work</h2>
        <ThoughtLine
          working={false}
          doneLabel="Found 4 referral sources, 1 problem"
          showTimer={false}
          collapseOnSettle={false}
          steps={[
            { label: "[Sample] Searched near Lincoln Park", status: "done" },
            { label: "[Sample] Picked the 4 closest", status: "done" },
            { label: "[Sample] Couldn't reach the fax list", status: "failed" },
          ]}
        />
      </GlassCard>

      <GlassCard className="flex flex-col gap-4 p-6">
        <h2 className="label-caps">Other states</h2>
        <ThoughtLine working label="Thinking…" />
        <ThoughtLine working={false} doneLabel="Found 4 referral sources near Lincoln Park" showTimer={false} />
      </GlassCard>
    </div>
  );
}
