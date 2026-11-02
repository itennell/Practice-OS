"use client";

import { useState } from "react";
import { TextField } from "./shared/settings-controls";
import { Button } from "./ui";

// Settings: her own cell for urgent alerts. Aeon texts it, and only it, if a message in her
// chat mentions danger (needs the phone line under Settings › Connections).
export function AlertPhoneSetting({ last4 }: { last4: string | null }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(last4);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/settings/alert-phone", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: value }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string; last4?: string } | null;
    setBusy(false);
    if (res?.ok && body?.last4) {
      setSaved(body.last4);
      setValue("");
      setMessage({ ok: true, text: "Saved." });
    } else {
      setMessage({ ok: false, text: body?.error ?? "Couldn't save. Try again." });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Your cell phone number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(312) 555-0100"
        description={saved ? `Saved, ending ${saved}. Type a new number to change it.` : "Not set yet."}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={message && !message.ok ? message.text : undefined}
      />
      <div className="flex items-center gap-3">
        <Button variant="primary" className="self-start" disabled={busy || !value.trim()} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <p aria-live="polite" className="text-small text-[var(--fg-muted)]">
          {message?.ok ? message.text : ""}
        </p>
      </div>
    </div>
  );
}
