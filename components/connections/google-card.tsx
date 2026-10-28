"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Chip } from "@/components/ui";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/components/shared/toaster";
import { GOOGLE_SCOPES } from "@/lib/connect/google-scopes";
import type { ConnectionStatus } from "./registry";
import { ConnectionCardFrame } from "./card-frame";
import { ConnectButton } from "./connect-button";

// One Google sign-in, two separate permissions: Gmail drafts (Referrals) and
// the calendar (Front Desk consult times). She turns on only what she uses.

const PARTS = [
  { label: "Gmail drafts", scopes: [GOOGLE_SCOPES.gmailCompose], why: "approved referral letters become drafts; you press send" },
  { label: "Google Calendar", scopes: [GOOGLE_SCOPES.calendarEvents, GOOGLE_SCOPES.calendarFreebusy], why: "consult times come from your calendar" },
];

export function GoogleCard({ status }: { status: ConnectionStatus }) {
  const router = useRouter();
  const has = (scopes: string[]) => scopes.every((s) => status.scopes.includes(s));

  const disconnect = async () => {
    const res = await fetch("/api/connect/google", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) throw new Error("Couldn't disconnect Google.");
    const { note } = (await res.json().catch(() => ({}))) as { note?: string };
    notify.success("Google disconnected.", note ? { description: note } : {});
    router.refresh();
  };

  return (
    <ConnectionCardFrame
      icon={<Mail className="size-5" />}
      title="Google"
      description="Turn on only what you use. Aeon never sends an email: letters wait in Gmail drafts for you."
      connected={status.connected}
      accountLabel={status.accountLabel}
    >
      {PARTS.map((part) =>
        status.connected && has(part.scopes) ? (
          <Chip key={part.label} on>
            {part.label} on
          </Chip>
        ) : (
          <ConnectButton key={part.label} provider="google" scopes={part.scopes} variant={status.connected ? "quiet" : "accent"} title={part.why}>
            {status.connected ? `Add ${part.label}` : `Connect ${part.label}`}
          </ConnectButton>
        ),
      )}
      {status.connected && (
        <ConfirmDialog
          trigger={<Button variant="quiet">Disconnect</Button>}
          title="Disconnect Google?"
          description="Practice-OS forgets this sign-in and asks Google to cancel it. Drafts already in Gmail stay there. You can connect again any time."
          confirmLabel="Disconnect Google"
          onConfirm={disconnect}
        />
      )}
    </ConnectionCardFrame>
  );
}
