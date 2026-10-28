"use client";

import { useState } from "react";
import { INPUT } from "./gfe-timing-check";
import { Button } from "./ui";

// The Illinois release form: who receives it, why, what, and until when. The
// PDF is made from these boxes and downloaded straight to her computer; nothing
// is saved. The client's name and birth date stay blank boxes in the PDF.

type Fields = { recipient: string; recipient_address: string; purpose: string; information: string; expires_on: string };

export function ReleaseFormBuilder({ initial, today }: { initial: Partial<Fields> | null; today: string }) {
  const [f, setF] = useState<Fields>({
    recipient: initial?.recipient ?? "",
    recipient_address: initial?.recipient_address ?? "",
    purpose: initial?.purpose ?? "",
    information: initial?.information ?? "",
    expires_on: initial?.expires_on ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim()));
      const res = await fetch("/api/release-forms/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Couldn't make the form. Try again.");
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "release-of-information.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ ok: true, text: "Downloaded. Fill in the client's name and birth date, then have it signed." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't make the form. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-small font-medium">
          Release to (person or agency)
          <input className={INPUT} value={f.recipient} onChange={set("recipient")} maxLength={160} />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
          Their address, phone or fax
          <input className={INPUT} value={f.recipient_address} onChange={set("recipient_address")} maxLength={200} />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
          Purpose
          <input className={INPUT} value={f.purpose} onChange={set("purpose")} maxLength={300} />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
          Exactly what to release
          <input className={INPUT} value={f.information} onChange={set("information")} maxLength={400} aria-describedby="release-info-hint" />
          <span id="release-info-hint" className="font-normal text-[var(--fg-muted)]">
            For example, dates of attendance and a treatment summary. “All records” isn’t valid in Illinois.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
          Consent ends on (required)
          <input type="date" required min={today} className={INPUT} value={f.expires_on} onChange={set("expires_on")} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Making it…" : "Download filled form"}
        </Button>
        {message && (
          <p role={message.ok ? "status" : "alert"} className="text-small font-medium" style={message.ok ? undefined : { color: "var(--danger-fg)" }}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
