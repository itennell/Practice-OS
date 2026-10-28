import { connection } from "next/server";
import { Suspense } from "react";
import { MemoryList, type MemoryView } from "@/components/memory-list";
import { listMemories } from "@/lib/aeon/memory";

// What Aeon remembers (AGENTS.md > Aeon's memory): view, edit, switch off and delete.
export default function MemoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-title">What Aeon remembers</h1>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          Aeon reads these in every conversation, on this computer and in any agent connected to Practice-OS. Practice
          facts only: no client names or clinical details until there is a business associate agreement.
        </p>
      </header>
      <Suspense fallback={<div aria-hidden className="h-40 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Memories />
      </Suspense>
    </div>
  );
}

async function Memories() {
  await connection();
  const memories: MemoryView[] = (await listMemories({ includeArchived: true })).map((m) => ({
    id: m.id,
    kind: m.kind,
    text: m.text,
    source: m.source,
    archived: m.archived,
    updated_at: m.updated_at.toISOString(),
  }));
  return <MemoryList initial={memories} />;
}
