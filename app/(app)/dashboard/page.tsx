import { connection } from "next/server";
import { Suspense } from "react";
import { ApprovalsInbox } from "@/components/approvals-inbox";
import { GlassCard } from "@/components/ui";
import { listApprovals } from "@/lib/approvals";
import { STAGE_LABEL, getProfile } from "@/lib/profile";
import { Chip } from "@/components/ui";

export default function DashboardPage() {
  return (
    <>
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>
      <GlassCard aria-labelledby="approvals-heading" className="flex flex-col gap-5 p-6 md:p-8">
        <h2 id="approvals-heading" className="text-section font-semibold">
          Approvals
        </h2>
        <Suspense fallback={<InboxSkeleton />}>
          <Inbox />
        </Suspense>
      </GlassCard>
    </>
  );
}

async function Header() {
  await connection(); // read the database per request, never at build time
  const profile = await getProfile();
  if (!profile) {
    return <h1 className="text-title">Welcome</h1>;
  }
  const first = profile.full_name.split(" ")[0];
  return (
    <header className="flex flex-col gap-4">
      <h1 className="text-title">Hi, {first}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Chip on>
          {profile.full_name}, {profile.credential}
        </Chip>
        <Chip>Stage: {STAGE_LABEL[profile.practice_stage]}</Chip>
        <Chip>{profile.practice_name}{profile.is_sample ? " (fictional demo practice)" : ""}</Chip>
        {profile.is_sample && <Chip>[Sample]</Chip>}
      </div>
    </header>
  );
}

async function Inbox() {
  await connection();
  const approvals = await listApprovals();
  return <ApprovalsInbox initial={approvals} />;
}

function HeaderSkeleton() {
  return (
    // Same chip widths as the real header so it wraps the same way (no layout shift on phones).
    <div aria-hidden className="flex flex-col gap-4">
      <div className="h-10 w-48 animate-pulse rounded-full bg-[var(--glass-strong)]" />
      <div className="flex flex-wrap gap-2">
        {["w-36", "w-56", "w-80", "w-20"].map((w) => (
          <div key={w} className={`h-chip ${w} max-w-full animate-pulse rounded-full bg-[var(--glass-strong)]`} />
        ))}
      </div>
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-[20px] bg-[var(--glass-strong)]" />
      ))}
    </div>
  );
}
