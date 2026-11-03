"use client";

import { useState } from "react";
import { TextField } from "./shared/settings-controls";
import { Button } from "./ui";

// Settings › Referrals: the ZIP Aeon searches around for doctors and others who could send her clients.
export function ReferralZipSetting({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/settings/referrals", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ homeZip: value.trim() }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    setMessage(res?.ok ? { ok: true, text: "Saved." } : { ok: false, text: body?.error ?? "Couldn't save. Try again." });
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Home ZIP code"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={5}
        placeholder="60614"
        description="Use the ZIP where most of your clients live."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={message && !message.ok ? message.text : undefined}
      />
      <div className="flex items-center gap-3">
        <Button variant="primary" className="self-start" disabled={busy || !/^\d{5}$/.test(value.trim())} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <p aria-live="polite" className="text-small text-[var(--fg-muted)]">
          {message?.ok ? message.text : ""}
        </p>
      </div>
    </div>
  );
}
