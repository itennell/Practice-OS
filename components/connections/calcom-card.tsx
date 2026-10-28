"use client";

import { CalendarCheck } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SettingSelect, TextField } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";

// Cal.com Connect card (Front Desk): paste her API key, pick her consult event
// type, live check. The calendar only ever sees "Phone consult FD-1042".

export type CalcomCardStatus = { connected: boolean; label?: string; fix?: string };
type EventType = { id: number; title: string; lengthInMinutes: number };

async function post(body: unknown) {
  const res = await fetch("/api/front-desk/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return ((await res?.json().catch(() => null)) ?? { ok: false, fix: "Couldn't reach Practice-OS. Try again." }) as {
    ok: boolean;
    fix?: string;
    label?: string;
    types?: EventType[];
  };
}

export function CalcomCard({ initial, onConnected }: { initial: CalcomCardStatus; onConnected?: () => void }) {
  const [status, setStatus] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [types, setTypes] = useState<EventType[] | null>(null);
  const [typeId, setTypeId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const check = async () => {
    setBusy(true);
    setError(undefined);
    const out = await post({ step: "calcom_types", apiKey });
    setBusy(false);
    if (!out.ok || !out.types) return setError(out.fix);
    setTypes(out.types);
    setTypeId(String((out.types.find((t) => t.lengthInMinutes <= 30) ?? out.types[0]).id));
  };

  const save = async () => {
    setBusy(true);
    setError(undefined);
    const out = await post({ step: "calcom_save", apiKey, eventTypeId: Number(typeId) });
    setBusy(false);
    if (!out.ok) return setError(out.fix);
    setStatus({ connected: true, label: out.label });
    setApiKey("");
    notify.success("Cal.com is connected.", { description: out.label });
    onConnected?.();
  };

  const disconnect = async () => {
    const res = await fetch("/api/front-desk/calendar", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) throw new Error("Couldn't disconnect. Try again.");
    setStatus({ connected: false });
    setTypes(null);
  };

  if (status.connected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 font-medium">
          <CalendarCheck aria-hidden size={18} className="text-[var(--status-done-fg)]" />
          {status.label ?? "Cal.com connected"}
        </p>
        {status.fix && (
          <p role="alert" className="text-[var(--danger-fg)]">
            {status.fix}
          </p>
        )}
        <ConfirmDialog
          trigger={<Button variant="quiet" className="self-start">Disconnect Cal.com</Button>}
          title="Disconnect Cal.com?"
          description="Front Desk will stop offering consult times until you connect a calendar again. Consults already booked stay on your calendar."
          confirmLabel="Disconnect Cal.com"
          onConfirm={disconnect}
        />
      </div>
    );
  }

  return (
    <ol className="flex list-none flex-col gap-4">
      <li>
        <p>
          <span className="font-semibold">1.</span> In Cal.com, go to <span className="font-medium">Settings, then Developer, then API keys</span>, and press{" "}
          <span className="font-medium">Add</span>. Name it Practice-OS and copy the key.
        </p>
      </li>
      <li className="flex flex-col gap-2">
        <p>
          <span className="font-semibold">2.</span> Paste the key here and press Check.
        </p>
        <TextField label="Cal.com API key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} error={types ? undefined : error} />
        <Button variant="quiet" className="self-start" disabled={busy || apiKey.trim().length === 0} onClick={check}>
          {busy && !types ? "Checking…" : "Check"}
        </Button>
      </li>
      {types && (
        <li className="flex flex-col gap-2">
          <p>
            <span className="font-semibold">3.</span> Pick the event type callers book as a consult, then press Connect.
          </p>
          <SettingSelect
            label="Consult event type"
            value={typeId}
            onValueChange={setTypeId}
            options={types.map((t) => ({ value: String(t.id), label: `${t.title} (${t.lengthInMinutes} min)` }))}
          />
          {error && (
            <p role="alert" className="text-small font-medium text-[var(--danger-fg)]">
              {error}
            </p>
          )}
          <Button variant="primary" className="self-start" disabled={busy} onClick={save}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </li>
      )}
    </ol>
  );
}
