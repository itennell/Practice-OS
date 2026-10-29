"use client";

import { CalendarCheck, CalendarDays, ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { ConnectionCardFrame } from "@/components/connections/card-frame";
import type { ConnectionStatus } from "@/components/connections/registry";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { Button, ButtonLink } from "@/components/ui";

// Cal.com Connect card (Front Desk). One button opens Cal.com's API-keys page;
// she makes a key in three steps and pastes it. Practice-OS checks it, finds or
// makes her 15-minute consult, and shows the next open time. The calendar only
// ever sees "Phone consult FD-1042"; the key is never shown again.

export const CALCOM_KEYS_URL = "https://app.cal.com/settings/developer/api-keys";
export const CALCOM_SIGNUP_URL = "https://cal.com/signup";

export type CalcomCardStatus = { connected: boolean; label?: string; fix?: string };
type Result = { ok: true; label: string; nextOpen: string | null; created: boolean } | { ok: false; fix: string };

const looksLikeKey = (v: string) => /^cal_\S{10,}$/.test(v.trim());

export function CalcomCard({ initial, onConnected }: { initial: CalcomCardStatus; onConnected?: () => void }) {
  const [status, setStatus] = useState(initial);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<string | null>(null);
  const lastTried = useRef("");

  const connect = async (value: string) => {
    const v = value.trim();
    if (!v || busy || v === lastTried.current) return;
    lastTried.current = v;
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/front-desk/calendar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "calcom_auto", apiKey: v }),
    }).catch(() => null);
    const out = ((await res?.json().catch(() => null)) ?? { ok: false, fix: "Couldn't reach Practice-OS. Try again." }) as Result | { ok?: false; fix?: string; error?: string };
    setBusy(false);
    if (!out.ok) {
      const failed = out as { fix?: string; error?: string };
      setError(failed.fix ?? failed.error ?? "Couldn't connect. Try again.");
      lastTried.current = ""; // let her try the same key again after fixing Cal.com
      return;
    }
    const line = out.nextOpen ? `Connected ✓ · next open time ${out.nextOpen}` : "Connected ✓. No open times this week. Add hours in Cal.com's Availability.";
    setDone(line);
    setStatus({ connected: true, label: out.label });
    setKey("");
    notify.success("Cal.com is connected.", { description: line });
    onConnected?.();
  };

  const disconnect = async () => {
    const res = await fetch("/api/front-desk/calendar", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) throw new Error("Couldn't disconnect. Try again.");
    setStatus({ connected: false });
    setDone(null);
    lastTried.current = "";
  };

  if (status.connected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 font-medium" role="status">
          <CalendarCheck aria-hidden size={18} className="text-[var(--status-done-fg)]" />
          {done ?? `Connected ✓ · ${status.label ?? "Cal.com"}`}
        </p>
        {status.fix && (
          <p role="alert" className="text-[var(--danger-fg)]">
            {status.fix}
          </p>
        )}
        <ConfirmDialog
          trigger={<Button variant="quiet" className="self-start">Disconnect Cal.com</Button>}
          title="Disconnect Cal.com?"
          description="Front Desk will stop offering consult times until you connect Cal.com again. Consults already booked stay on your calendar."
          confirmLabel="Disconnect Cal.com"
          onConfirm={disconnect}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col items-start gap-3">
        <ButtonLink href={CALCOM_KEYS_URL} target="_blank" rel="noopener noreferrer" variant="primary">
          Connect Cal.com <ExternalLink aria-hidden size={18} />
          <span className="sr-only">(opens Cal.com in a new tab)</span>
        </ButtonLink>
        <p className="text-small text-[var(--fg-muted)]">
          No Cal.com account?{" "}
          <a href={CALCOM_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--accent-fg)] underline underline-offset-2">
            Sign up first
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </div>
      <section aria-label="Steps in Cal.com" className="flex flex-col gap-3 rounded-[20px] border border-border bg-[var(--chip-off-bg)] p-4">
        <ol className="flex list-none flex-col gap-2">
          <li>
            <span className="font-semibold">1.</span> In Cal.com, press <span className="font-medium">+ New</span>.
          </li>
          <li>
            <span className="font-semibold">2.</span> Name it <span className="font-medium">Practice-OS</span>, choose <span className="font-medium">Never expires</span>, then press{" "}
            <span className="font-medium">Create</span>.
          </li>
          <li>
            <span className="font-semibold">3.</span> Press <span className="font-medium">Copy</span>, come back here and paste it below.
          </li>
        </ol>
        <TextField
          label="Paste your Cal.com key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          error={error}
          disabled={busy}
          // Typing waits for the Check button; only a paste connects on its own.
          onChange={(e) => setKey(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").trim();
            if (looksLikeKey(pasted)) {
              e.preventDefault();
              setKey(pasted.trim());
              void connect(pasted);
            }
          }}
        />
        <p aria-live="polite" className="min-h-6 text-small text-[var(--fg-muted)]">
          {busy ? "Checking your key and finding your consult in Cal.com…" : ""}
        </p>
        <Button
          variant="quiet"
          className="self-start"
          disabled={busy || key.trim().length === 0}
          onClick={() => {
            lastTried.current = "";
            void connect(key);
          }}
        >
          Check
        </Button>
      </section>
    </div>
  );
}

/** Settings › Connections and onboarding entry (components/connections/registry.ts). */
export function CalcomConnectionCard({ status }: { status: ConnectionStatus }) {
  return (
    <ConnectionCardFrame
      icon={<CalendarDays className="size-5" />}
      title="Cal.com"
      description="Front Desk offers callers your open consult times from Cal.com and books the one they pick. Only a reference number goes on the booking."
      connected={status.connected}
      accountLabel={status.accountLabel?.replace(/^Connected: /, "")}
    >
      <div className="basis-full">
        <CalcomCard initial={{ connected: status.connected, label: status.accountLabel }} />
      </div>
    </ConnectionCardFrame>
  );
}
