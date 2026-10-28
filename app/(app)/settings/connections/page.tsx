import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CONNECTION_CARDS } from "@/components/connections/registry";
import { ConnectResult } from "@/components/connections/connect-result";
import { getConnectionStatus } from "@/lib/connect/status";

export const metadata: Metadata = { title: "Connections · Practice-OS" };

export default function Page({ searchParams }: PageProps<"/settings/connections">) {
  return (
    <>
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="text-title">Connections</h1>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          Turn on a helper when you&rsquo;re ready. Each Connect button opens the company&rsquo;s own sign-in page, so you never copy a password
          into Practice-OS. Sign-ins are kept encrypted on this computer.
        </p>
      </div>
      <Suspense fallback={<div aria-hidden className="h-96 max-w-3xl animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Cards searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Cards({ searchParams }: { searchParams: PageProps<"/settings/connections">["searchParams"] }) {
  await connection(); // read the database per request, never at build time
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const cards = [...CONNECTION_CARDS].sort((a, b) => a.order - b.order);
  const statuses = await Promise.all(cards.map((c) => getConnectionStatus(c.id)));
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <ConnectResult connected={one(params.connected)} error={one(params.error)} />
      {process.env.VERCEL && (
        <p className="text-[var(--fg-muted)]">This is the view-only demo. Connect buttons work in Practice-OS on your own computer.</p>
      )}
      {cards.map(({ id, Card }, i) => (
        <Card key={id} status={statuses[i]} />
      ))}
    </div>
  );
}
