"use client";

// The Instagram card on Settings › Connections. Connect goes through lib/connect
// (the relay does Meta's sign-in); the live check asks Instagram who the stored
// sign-in belongs to, so a token Instagram stopped accepting shows a plain fix.

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusPill } from "@/components/shared/status-mark";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";
import type { LiveCheck } from "@/lib/instagram/account";
import { ConnectionCardFrame } from "./card-frame";
import { ConnectButton } from "./connect-button";
import type { ConnectionStatus } from "./registry";

type Check = LiveCheck | { state: "checking" };

export function InstagramCard({ status }: { status: ConnectionStatus }) {
  const router = useRouter();
  const [check, setCheck] = useState<Check>(status.connected ? { state: "checking" } : { state: "not_connected" });

  useEffect(() => {
    if (!status.connected) return;
    let live = true;
    fetch("/api/instagram/status", { cache: "no-store" })
      .then((r) => r.json() as Promise<LiveCheck>)
      .then((c) => live && setCheck(c))
      .catch(() => live && setCheck({ state: "unreachable", reason: "Couldn't reach Practice-OS. Check that the app is running." }));
    return () => {
      live = false;
    };
  }, [status.connected]);

  const disconnect = async () => {
    const res = await fetch("/api/connect/instagram", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) throw new Error("Couldn't disconnect Instagram.");
    const { note } = (await res.json().catch(() => ({}))) as { note?: string };
    notify.success(note ? `Instagram disconnected. ${note}` : "Instagram disconnected.");
    router.refresh();
  };

  const connected = check.state === "connected";
  return (
    <ConnectionCardFrame
      icon={<Camera className="size-5" />}
      title="Instagram"
      description="Posts about your practice go to your Instagram only after you approve each one."
      connected={connected}
      accountLabel={connected ? `@${check.username}` : undefined}
    >
      <div role="status" aria-live="polite" className="basis-full">
        {check.state === "checking" && <StatusPill status="running">Checking with Instagram…</StatusPill>}
        {(check.state === "needs_reconnect" || check.state === "unreachable") && (
          <p className="max-w-[55ch] font-medium" style={{ color: "var(--danger-fg)" }}>
            {check.reason}
          </p>
        )}
        {check.state === "not_connected" && status.notReady && <p className="text-small text-[var(--fg-muted)]">{status.notReady}</p>}
        {check.state === "not_connected" && !status.notReady && (
          <p className="text-small text-[var(--fg-muted)]">
            You&rsquo;ll sign in on Instagram&rsquo;s own page. It needs an Instagram professional (business or creator) account.
          </p>
        )}
      </div>
      {!connected && check.state !== "checking" && !status.notReady && (
        <ConnectButton provider="instagram" variant="accent">
          {check.state === "not_connected" ? "Connect Instagram" : "Connect again"}
        </ConnectButton>
      )}
      {status.connected && (
        <ConfirmDialog
          trigger={<Button variant="quiet">Disconnect</Button>}
          title="Disconnect Instagram?"
          description="Practice-OS forgets this sign-in. Posts already on Instagram stay there. You can connect again any time."
          confirmLabel="Disconnect Instagram"
          onConfirm={disconnect}
        />
      )}
    </ConnectionCardFrame>
  );
}
