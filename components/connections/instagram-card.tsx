"use client";

// The Instagram card on Settings › Connections (connect interface v0: one line
// in components/connections/registry.ts). Connect goes through lib/connect's
// start route; the live check asks Instagram who the stored sign-in belongs to.

import { useEffect, useState } from "react";
import type { LiveCheck } from "@/lib/instagram/account";
import { SCOPES } from "@/lib/instagram/graph";
import { StatusPill } from "../shared/status-mark";
import { ButtonLink, GlassCard } from "../ui";

/** The shape lib/connect's getConnectionStatus returns (v0). */
export type ConnectionStatus = { provider: string; connected: boolean; accountLabel?: string; scopes: string[]; expiresAt?: string };

export const INSTAGRAM_CONNECT_HREF = `/api/connect/instagram/start?scopes=${SCOPES.join(",")}`;

type Check = LiveCheck | { state: "checking" };

export function InstagramCard({ status }: { status: ConnectionStatus }) {
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

  return (
    <GlassCard aria-labelledby="instagram-card-title" className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <span aria-hidden className="orb-instagram inline-block size-9 shrink-0" />
        <h2 id="instagram-card-title" className="text-section font-semibold">
          Instagram
        </h2>
      </div>
      <p className="max-w-[55ch] text-[var(--fg-muted)]">Posts to your practice&rsquo;s Instagram, only after you approve each post.</p>
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        {check.state === "checking" && <StatusPill status="running">Checking with Instagram…</StatusPill>}
        {check.state === "connected" && <StatusPill status="done">Connected as @{check.username}</StatusPill>}
        {(check.state === "needs_reconnect" || check.state === "unreachable") && (
          <p className="max-w-[55ch] font-medium" style={{ color: "var(--danger-fg)" }}>
            {check.reason}
          </p>
        )}
      </div>
      {check.state !== "connected" && check.state !== "checking" && (
        <ButtonLink variant="primary" href={INSTAGRAM_CONNECT_HREF} className="w-fit">
          {check.state === "not_connected" ? "Connect Instagram" : "Connect again"}
        </ButtonLink>
      )}
      {check.state === "not_connected" && (
        <p className="text-small text-[var(--fg-muted)]">
          You&rsquo;ll sign in on Instagram&rsquo;s own page. You need an Instagram professional (business or creator) account.
        </p>
      )}
    </GlassCard>
  );
}
