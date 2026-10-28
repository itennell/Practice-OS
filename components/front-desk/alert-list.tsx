"use client";

import { AlertTriangle, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";
import type { AlertView } from "@/lib/frontdesk/view";

// What needs her: crisis alerts pinned first in the danger color until she
// marks them seen (HB 1806 safety rule), then questions callers asked.
export function AlertList({ initial }: { initial: AlertView[] }) {
  const [alerts, setAlerts] = useState(initial);
  if (alerts.length === 0) return <p className="text-[var(--fg-muted)]">Nothing needs you right now.</p>;

  const ack = async (id: string) => {
    const res = await fetch(`/api/front-desk/alerts/${id}/ack`, { method: "POST" }).catch(() => null);
    if (!res?.ok) return notify.error("Couldn't mark that as seen.", { description: "Try again." });
    setAlerts((a) => a.filter((x) => x.id !== id));
  };

  return (
    <ul className="flex flex-col gap-3">
      {alerts.map((a) => {
        const crisis = a.kind === "crisis";
        return (
          <li
            key={a.id}
            className={`flex flex-col gap-3 rounded-[20px] border p-4 sm:flex-row sm:items-center sm:justify-between ${
              crisis ? "border-[var(--danger-fg)] bg-[var(--danger-bg)]/10" : "border-border bg-[var(--chip-off-bg)]"
            }`}
          >
            <p className="flex items-start gap-3">
              {crisis ? (
                <AlertTriangle aria-hidden size={20} className="mt-0.5 shrink-0 text-[var(--danger-fg)]" />
              ) : (
                <MessageCircleQuestion aria-hidden size={20} className="mt-0.5 shrink-0 text-[var(--fg-muted)]" />
              )}
              <span>
                <span className="sr-only">{crisis ? "Urgent: " : "Question: "}</span>
                <span className={crisis ? "font-semibold text-[var(--danger-fg)]" : ""}>{a.message}</span>
                <span className="block text-small text-[var(--fg-muted)]">
                  {new Date(a.createdAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
            </p>
            <Button variant="quiet" className="shrink-0 self-start sm:self-center" onClick={() => ack(a.id)}>
              {crisis ? "I've seen this" : "Done"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
