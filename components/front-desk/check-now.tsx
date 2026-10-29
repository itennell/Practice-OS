"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";

// Front Desk checks every minute while the app is open; this runs it now.
export function CheckNow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/front-desk/check", { method: "POST" }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { ran: boolean; reason?: string; voicemails?: number; texts?: number; error?: string } | null;
    setBusy(false);
    if (!out) return notify.error("Couldn't check.", { description: "Try again in a minute." });
    if (!out.ran) {
      return out.reason === "no_phone"
        ? notify.error("No phone connected.", { description: "Connect your phone company below first." })
        : notify.success("A check is already running.");
    }
    if (out.error) notify.error("Front Desk couldn't finish the check.", { description: out.error });
    else notify.success(`Checked: ${out.voicemails ?? 0} new voicemail${out.voicemails === 1 ? "" : "s"}, ${out.texts ?? 0} new text${out.texts === 1 ? "" : "s"}.`);
    router.refresh();
  };
  return (
    <Button variant="quiet" onClick={run} disabled={busy}>
      <RefreshCw aria-hidden size={18} className={busy ? "motion-safe:animate-spin" : ""} /> {busy ? "Checking…" : "Check now"}
    </Button>
  );
}
