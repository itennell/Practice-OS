"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";

type CheckOut = { ran: boolean; reason?: string; calls?: number; voicemails?: number; texts?: number; checkedAt?: string; error?: string };

const plural = (n: number, word: string) => `${n} new ${word}${n === 1 ? "" : "s"}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "Found 1 new call, 1 new voicemail, 0 new texts." */
export function foundLine(out: CheckOut): string {
  return `Found ${plural(out.calls ?? 0, "call")}, ${plural(out.voicemails ?? 0, "voicemail")}, ${plural(out.texts ?? 0, "text")}.`;
}

// Front Desk checks every minute while the app is open; this runs it now and
// says what it found and when it last looked.
export function CheckNow({ last }: { last: { checkedAt: string | null; error: string | null } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(last.checkedAt);
  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/front-desk/check", { method: "POST" }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as CheckOut | null;
    setBusy(false);
    if (!out) return notify.error("Couldn't check.", { description: "Try again in a minute." });
    if (!out.ran) {
      return out.reason === "no_phone"
        ? notify.error("No phone connected.", { description: "Connect your phone company below first." })
        : notify.success("A check is already running.");
    }
    if (out.checkedAt) setCheckedAt(out.checkedAt);
    setResult(out.error ? `Front Desk couldn't finish: ${out.error}` : foundLine(out));
    if (out.error) notify.error("Front Desk couldn't finish the check.", { description: out.error });
    else notify.success(`Checked. ${foundLine(out)}`);
    router.refresh();
  };
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="quiet" onClick={run} disabled={busy}>
        <RefreshCw aria-hidden size={18} className={busy ? "motion-safe:animate-spin" : ""} /> {busy ? "Checking…" : "Check now"}
      </Button>
      <p role="status" className="text-small text-[var(--fg-muted)] sm:text-right">
        {result ?? (last.error ? `Last check had a problem: ${last.error}` : null)}
        {result || last.error ? " " : ""}
        {checkedAt ? `Last checked ${time(checkedAt)}.` : "Not checked yet."}
      </p>
    </div>
  );
}
