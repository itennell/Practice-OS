import { connection } from "next/server";
import { Suspense } from "react";
import { ApprovalsInbox } from "@/components/approvals-inbox";
import { PageHeader } from "@/components/ui";
import { listApprovals } from "@/lib/approvals";

export const metadata = { title: "Approvals · Practice-OS" };

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader title="Approvals" description="Everything Aeon wants to send, post or book, and what happened to it." />
      <Suspense fallback={<p className="text-[var(--fg-muted)]">Loading approvals…</p>}>
        <AllApprovals />
      </Suspense>
    </>
  );
}

async function AllApprovals() {
  await connection(); // read the database per request, never at build time
  return <ApprovalsInbox initial={await listApprovals({ includeDecided: true })} showAll />;
}
