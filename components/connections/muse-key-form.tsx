"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { TextField } from "@/components/shared/settings-controls";

// Pasting her own Meta Muse key, with the steps to get one. Used by onboarding
// (MuseKeyStep) and by the Muse card in Settings › Connections.

export const META_KEY_PAGE = "https://dev.meta.ai/";

export function MuseKeyForm({ onSaved, submitLabel = "Check and continue" }: { onSaved: (accountLabel: string) => void; submitLabel?: string }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/settings/muse-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: key.trim() }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string; accountLabel?: string };
    setBusy(false);
    if (!res?.ok) return setError(body.error ?? "Couldn't save the key. Try again.");
    setKey("");
    onSaved(body.accountLabel ?? "Connected");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[var(--fg)]">
        <li>
          Open{" "}
          <a href={META_KEY_PAGE} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent-fg)] underline underline-offset-2">
            Meta&rsquo;s developer page
          </a>{" "}
          (it opens in your browser).
        </li>
        <li>Sign in with your Facebook or Meta account.</li>
        <li>Go to API keys, choose Create key, then Copy.</li>
        <li>Come back here and paste it below.</li>
      </ol>
      <TextField
        label="Your Muse key"
        description="Kept encrypted on this computer and sent only to Meta."
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        error={error}
        required
      />
      <div>
        <Button type="submit" variant="primary" disabled={busy || key.trim().length < 20}>
          {busy ? "Checking the key…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
