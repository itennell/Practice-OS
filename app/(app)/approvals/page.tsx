import { connection } from "next/server";
import { Suspense } from "react";
import { ApprovalsInbox } from "@/components/approvals-inbox";
import { GlassCard } from "@/components/ui";
import { listApprovals } from "@/lib/approvals";

export const metadata = { title: "Approvals · Practice-OS" };

export default function ApprovalsPage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Approvals</h1>
        <p className="max-w-[65ch] text-[var(--fg-muted)]">
          Everything Aeon wants to send, post or book, and what happened to it.
        </p>
      </header>
      <GlassCard className="p-6 md:p-8">
        <Suspense fallback={<p className="text-[var(--fg-muted)]">Loading approvals…</p>}>
          <AllApprovals />
        </Suspense>
      </GlassCard>
    </>
  );
}

async function AllApprovals() {
  await connection(); // read the database per request, never at build time
  return <ApprovalsInbox initial={await listApprovals({ includeDecided: true })} showAll />;
}
