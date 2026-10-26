import type { ReactNode } from "react";
import { GlassCard } from "./ui";

export function ComingNext({ title, children, orb }: { title: string; children: ReactNode; orb?: string }) {
  return (
    <>
      <h1 className="text-title">{title}</h1>
      <GlassCard className="flex max-w-2xl items-start gap-5 p-6 md:p-8">
        {orb && <span aria-hidden className={`${orb} mt-1 inline-block size-10 shrink-0`} />}
        <div className="flex flex-col gap-2">
          <p className="font-semibold">Coming next</p>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">{children}</p>
        </div>
      </GlassCard>
    </>
  );
}
