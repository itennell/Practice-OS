"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { notify } from "@/components/shared/toaster";
import { Button, ButtonLink } from "./ui";

// The plain-English bar just above the chat box whenever something is waiting
// for her: "Aeon needs your approval. Can Aeon get this done for you?" Approve
// runs it; Not now leaves it in Approvals for later. Things Aeon already did on
// its own, and failed, show here too so nothing fails quietly.

type Waiting = { id: string; title: string; status: string; decided_by: string | null; error: string | null };

async function fetchWaiting(): Promise<Waiting[] | null> {
  const res = await fetch("/api/approvals", { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const { approvals } = (await res.json()) as { approvals: Waiting[] };
  return approvals.filter((a) => a.status === "pending" || (a.status === "failed" && a.decided_by?.startsWith("auto:")));
}

export function ApprovalAskBar({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<Waiting[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchWaiting().then((list) => {
      if (alive && list) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey, reload]);

  const shown = items.filter((a) => !skipped.has(a.id));
  const first = shown[0];
  if (!first) return null;
  const failed = first.status === "failed";

  async function approve() {
    setBusy(true);
    const res = await fetch(`/api/approvals/${first.id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setBusy(false);
    if (!res.ok) notify.error("Couldn't approve that just now.", { description: "It's still waiting in Approvals." });
    setReload((n) => n + 1);
  }

  return (
    // Lays out by its own width, not the window's: beside the sidebar the chat column can be narrow.
    <div role="region" aria-label="Waiting for your approval" className="@container mb-3">
      <div className="glass flex flex-col gap-3 rounded-[20px] px-4 py-3 @xl:flex-row @xl:items-center @xl:justify-between">
        <div className="flex min-w-0 flex-col">
          <p className="font-medium text-[var(--fg)]">
            {failed ? "Something Aeon did on its own didn’t work." : "Aeon needs your approval. Can Aeon get this done for you?"}
          </p>
          <p className="truncate text-small text-[var(--fg-muted)]">
            {first.title}
            {shown.length > 1 && ` · ${shown.length - 1} more waiting`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {failed ? (
            <ButtonLink href="/approvals" variant="primary">
              See what happened
            </ButtonLink>
          ) : (
            <Button type="button" variant="primary" disabled={busy} onClick={() => void approve()}>
              {busy ? "Working…" : "Approve"}
            </Button>
          )}
          <Button type="button" variant="quiet" onClick={() => setSkipped((s) => new Set(s).add(first.id))}>
            Not now
          </Button>
          {!failed && (
            <Link href="/approvals" className="px-2 text-small font-semibold text-[var(--link)] underline-offset-4 hover:underline">
              See details
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
