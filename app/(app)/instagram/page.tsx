import { connection } from "next/server";
import { Suspense } from "react";
import { InstagramBoard } from "@/components/instagram/instagram-board";
import { listApprovalsById } from "@/lib/approvals";
import { liveCheck } from "@/lib/instagram/account";
import { listPosts } from "@/lib/instagram/store";

export const metadata = { title: "Instagram · Practice-OS" };

// Instagram (AGENTS.md > The four helpers): this week's posts, why any were
// blocked, what waits for her approval, and links to the ones that are live.
export default function InstagramPage() {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <header className="flex items-start gap-4">
        <span aria-hidden className="orb-instagram mt-1 inline-block size-10 shrink-0" />
        <div className="flex flex-col gap-2">
          <h1 className="text-title">Instagram</h1>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">
            Posts about how your practice works: first sessions, fees, booking, you, and where you see clients. Nothing
            goes on Instagram until you approve it.
          </p>
        </div>
      </header>
      <Suspense fallback={<div aria-hidden className="h-40 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  await connection(); // read the database per request, never at build time
  const [posts, account] = await Promise.all([listPosts({ limit: 30 }), liveCheck().catch(() => ({ state: "unreachable" as const, reason: "" }))]);
  const approvals = await listApprovalsById(posts.flatMap((p) => (p.approvalId ? [p.approvalId] : [])));
  return <InstagramBoard initialPosts={posts} initialApprovals={approvals} account={account} />;
}
