"use client";

import { Copy, Phone } from "lucide-react";
import { ConnectionCardFrame } from "@/components/connections/card-frame";
import type { ConnectionStatus } from "@/components/connections/registry";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { Button, Chip } from "@/components/ui";
import { phoneCardView, type PhoneCardStatus } from "@/lib/frontdesk/phone/card-view";

// Phone Connect card (Front Desk). She brings her own phone company; Practice-OS
// never owns her number. Spruce needs one email to its Support, then one pasted
// token with a live check. When Isaiah's developer Twilio line is on (the demo),
// the card shows that line as connected instead and offers no setup.

export type { PhoneCardStatus };

export const SPRUCE_SUPPORT_MESSAGE =
  "Hi, please turn on API access for my Spruce account. I use Practice-OS, an open-source front-desk helper, " +
  "to read my practice line's voicemails and texts and to text callers their consult times. Thank you.";

export function PhoneCard({ initial }: { initial: PhoneCardStatus }) {
  const [status, setStatus] = useState(initial);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const connect = async () => {
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/front-desk/phone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vendor: "spruce", token }),
    }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { ok: boolean; label?: string; fix?: string } | null;
    setBusy(false);
    if (out?.ok) {
      setStatus({ connected: true, label: out.label });
      setToken("");
      notify.success("Your phone is connected.", { description: out.label });
    } else {
      setError(out?.fix ?? "Couldn't reach Practice-OS. Try again.");
    }
  };

  const disconnect = async () => {
    const res = await fetch("/api/front-desk/phone", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) throw new Error("Couldn't disconnect. Try again.");
    setStatus({ connected: false });
    notify.success("Phone disconnected.", { description: "Front Desk stopped reading your voicemails and texts." });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SPRUCE_SUPPORT_MESSAGE);
      notify.success("Message copied.", { description: "Paste it into Spruce's Help chat." });
    } catch {
      notify.error("Couldn't copy.", { description: "Select the message and copy it yourself." });
    }
  };

  const view = phoneCardView(status);
  return (
    <ConnectionCardFrame
      icon={<Phone className="size-5" />}
      title="Practice phone"
      description={view.description}
      connected={view.connected}
      accountLabel={view.accountLabel}
    >
      <div className="flex basis-full flex-col gap-4">
        {view.connected ? (
          <div className="flex flex-col gap-3">
            {view.fix && (
              <p role="alert" className="text-[var(--danger-fg)]">
                {view.fix}
              </p>
            )}
            {view.note && <p className="max-w-[60ch] text-small text-[var(--fg-muted)]">{view.note}</p>}
            {view.canDisconnect && (
              <ConfirmDialog
                trigger={<Button variant="quiet" className="self-start">Disconnect</Button>}
                title="Disconnect your phone?"
                description="Front Desk will stop reading your voicemails and texts until you connect again. Your phone number and Spruce account are not changed."
                confirmLabel="Disconnect phone"
                onConfirm={disconnect}
              />
            )}
          </div>
        ) : view.showSpruceSetup && (
          <>
            <div className="flex flex-wrap gap-2" aria-label="Phone company">
              <Chip on>Spruce Health</Chip>
              <Chip>Quo (coming later)</Chip>
            </div>
            <ol className="flex list-none flex-col gap-4">
              <li className="flex flex-col gap-2">
                <p>
                  <span className="font-semibold">1.</span> In the Spruce app, open <span className="font-medium">Help</span> and send Spruce this message. You only do this once.
                </p>
                <blockquote className="max-w-[60ch] rounded-[16px] border border-border bg-[var(--chip-off-bg)] p-4 text-small">{SPRUCE_SUPPORT_MESSAGE}</blockquote>
                <Button variant="quiet" className="self-start" onClick={copy}>
                  <Copy aria-hidden size={18} /> Copy the message
                </Button>
              </li>
              <li>
                <p>
                  <span className="font-semibold">2.</span> When Spruce writes back that it&apos;s on, go to <span className="font-medium">Settings, then API Access</span> in Spruce and press{" "}
                  <span className="font-medium">Create token</span>.
                </p>
              </li>
              <li className="flex flex-col gap-2">
                <p>
                  <span className="font-semibold">3.</span> Paste the token here and press Connect. Practice-OS checks it right away.
                </p>
                <TextField
                  label="Spruce token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  error={error}
                />
                <Button variant="primary" className="self-start" disabled={busy || token.trim().length === 0} onClick={connect}>
                  {busy ? "Checking…" : "Connect"}
                </Button>
              </li>
            </ol>
          </>
        )}
      </div>
    </ConnectionCardFrame>
  );
}

/** Settings › Connections entry (components/connections/registry.ts). */
export function PhoneConnectionCard({ status }: { status: ConnectionStatus }) {
  return <PhoneCard initial={{ connected: status.connected, label: status.accountLabel, ...status.phone }} />;
}
