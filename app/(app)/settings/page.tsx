import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { stat } from "node:fs/promises";
import { AeonFiles, type AeonFile } from "@/components/aeon-files";
import { ComingNext } from "@/components/coming-next";
import { OfficeSettings } from "@/components/office-settings";
import { GlassCard } from "@/components/ui";
import { listMemories, memoryMarkdown } from "@/lib/aeon/memory";
import { MEMORY_CAP_CHARS, usedChars } from "@/lib/aeon/memory-ops";
import { SOUL_PATH, soul } from "@/lib/aeon/soul";
import { loadPracticeSettings } from "@/lib/gfe/store";

export const metadata: Metadata = { title: "Settings · Practice-OS" };

export default function Page() {
  return (
    <>
      <ComingNext title="Settings">
        Choose which kinds of actions run without asking, and connect Instagram, Gmail, Cal.com and your phone number.
      </ComingNext>
      <Suspense fallback={<div aria-hidden className="h-96 max-w-3xl animate-pulse rounded-[24px] bg-[var(--glass-strong)]" />}>
        <Office />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="h-64 max-w-3xl animate-pulse rounded-[24px] bg-[var(--glass-strong)]" />}>
        <Aeon />
      </Suspense>
    </>
  );
}

async function Office() {
  await connection(); // read the database per request, never at build time
  const { hours, fees } = await loadPracticeSettings();
  return (
    <GlassCard aria-labelledby="office-heading" className="flex max-w-3xl flex-col gap-4 p-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="office-heading" className="text-section font-semibold">
          Office hours and fees
        </h2>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          Good Faith Estimate due dates count only the days you’re open. Your fees fill in new estimates.
        </p>
      </div>
      <OfficeSettings initialHours={hours} initialFees={fees} />
    </GlassCard>
  );
}

// Settings → Aeon: Soul and Memory, read only (UI-008). Memory is rendered from
// the database each time, so the Vercel copy shows the same notes.
async function Aeon() {
  await connection();
  const memories = await listMemories();
  const soulDay = await stat(SOUL_PATH)
    .then((s) => s.mtime.toISOString().slice(0, 10))
    .catch(() => null);
  const newest = memories.reduce<Date | null>((d, m) => (!d || m.updated_at > d ? m.updated_at : d), null);
  const used = usedChars(memories);
  const files: AeonFile[] = [
    { id: "soul", title: "Soul", subtitle: "Who Aeon is and the rules it keeps", updated: soulDay, text: soul() },
    {
      id: "memory",
      title: "Memory",
      subtitle: "What Aeon remembers about this practice",
      updated: newest ? newest.toISOString().slice(0, 10) : null,
      text: memoryMarkdown(memories),
    },
  ];
  const usage = `${memories.length} ${memories.length === 1 ? "memory" : "memories"} · ${used.toLocaleString("en-US")} / ${MEMORY_CAP_CHARS.toLocaleString("en-US")} characters`;
  return (
    <GlassCard aria-labelledby="aeon-heading" className="flex max-w-3xl flex-col gap-4 p-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="aeon-heading" className="text-section font-semibold">
          Aeon
        </h2>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          What makes Aeon who it is, and what it has learned about your practice. Open them to read; to change a memory, tell Aeon in chat.
        </p>
      </div>
      <AeonFiles files={files} usage={usage} />
    </GlassCard>
  );
}
