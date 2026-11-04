import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CONNECTION_CARDS } from "@/components/connections/registry";
import { getConnectionStatus } from "@/lib/connect/status";

export const metadata: Metadata = { title: "Connections · Practice-OS" };

export default function Page() {
  return (
    <>
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="text-title">Connections</h1>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          Aeon thinks with your own Muse key. It is checked when you paste it and kept encrypted on this computer.
        </p>
      </div>
      <Suspense fallback={<div aria-hidden className="h-96 max-w-3xl animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Cards />
      </Suspense>
    </>
  );
}

async function Cards() {
  await connection(); // read the database per request, never at build time
  const cards = [...CONNECTION_CARDS].sort((a, b) => a.order - b.order);
  const statuses = await Promise.all(cards.map((c) => getConnectionStatus(c.id)));
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {process.env.VERCEL && (
        <p className="text-[var(--fg-muted)]">This is the view-only demo. Your Muse key is added in Practice-OS on your own computer.</p>
      )}
      {cards.map(({ id, Card }, i) => (
        <Card key={id} status={statuses[i]} />
      ))}
    </div>
  );
}
