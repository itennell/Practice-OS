"use client";

import { Copy, Phone } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { Button, Chip } from "@/components/ui";

// Phone Connect card (Front Desk). She brings her own phone company; Practice-OS
// never owns her number. Spruce needs one email to its Support, then one pasted
// token with a live check. Isaiah's developer Twilio line is never offered here.

export type PhoneCardStatus = { connected: boolean; label?: string; fix?: string; devLine?: boolean };

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

  return (
    <section aria-labelledby="phone-card-title" className="tile flex flex-col gap-4 p-5 md:p-6">
      <header className="flex items-center gap-3">
        <span aria-hidden className="orb-front-desk inline-block size-8 shrink-0" />
        <h2 id="phone-card-title" className="text-section">
          Your practice phone
        </h2>
      </header>

      {status.connected ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-medium">
            <Phone aria-hidden size={18} className="text-[var(--status-done-fg)]" />
            {status.label ?? "Connected"}
          </p>
          {status.fix && (
            <p role="alert" className="text-[var(--danger-fg)]">
              {status.fix}
            </p>
          )}
          {status.devLine ? (
            <p className="text-small text-[var(--fg-muted)]">This is the developer test line from .env, not a clinician&apos;s account.</p>
          ) : (
            <ConfirmDialog
              trigger={<Button variant="quiet" className="self-start">Disconnect</Button>}
              title="Disconnect your phone?"
              description="Front Desk will stop reading your voicemails and texts until you connect again. Your phone number and Spruce account are not changed."
              confirmLabel="Disconnect phone"
              onConfirm={disconnect}
            />
          )}
        </div>
      ) : (
        <>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">
            Front Desk reads your voicemails and texts from your own phone company and texts callers your open consult times.
          </p>
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
    </section>
  );
}
