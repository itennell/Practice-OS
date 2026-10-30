"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateField } from "@/components/shared/date-field";
import { SettingSwitch, TextAreaField, TextField } from "@/components/shared/settings-controls";
import { Button } from "@/components/ui";
import type { Policies } from "@/lib/client-forms/types";

// The two editors on Admin › Client forms: her practice policies (used by every
// form) and her wording for one form. Both save practice wording only; the
// server refuses client details and any edit that drops a required element.

type Message = { ok: boolean; text: string } | null;

async function send(url: string, method: "PUT" | "DELETE", body?: unknown): Promise<void> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Couldn't save. Try again.");
}

function Status({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.ok ? "status" : "alert"} className="max-w-[65ch] text-small font-medium" style={{ color: message.ok ? "var(--status-done-fg)" : "var(--danger-fg)" }}>
      {message.text}
    </p>
  );
}

export function ClientFormEditor({ form, clauses, saved }: { form: string; clauses: { id: string; text: string }[]; saved: { clauses?: Record<string, string>; extra?: string } }) {
  const router = useRouter();
  const [text, setText] = useState<Record<string, string>>(Object.fromEntries(clauses.map((c) => [c.id, saved.clauses?.[c.id] ?? c.text])));
  const [extra, setExtra] = useState(saved.extra ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: done });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const changed = Object.fromEntries(clauses.filter((c) => text[c.id].trim() !== c.text).map((c) => [c.id, text[c.id]]));
  return (
    <div className="flex flex-col gap-4">
      {clauses.map((c, i) => (
        <TextAreaField key={c.id} label={`Paragraph ${i + 1}`} rows={4} value={text[c.id]} maxLength={2000} onChange={(e) => setText((t) => ({ ...t, [c.id]: e.target.value }))} />
      ))}
      <TextAreaField
        label="Add your own paragraph (optional)"
        description="Printed just before the signature lines."
        rows={3}
        value={extra}
        maxLength={2000}
        onChange={(e) => setExtra(e.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => run(() => send(`/api/client-forms/${form}`, "PUT", { clauses: changed, extra }), "Saved. Downloads now use your wording.")}>
          Save wording
        </Button>
        <Button
          variant="quiet"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await send(`/api/client-forms/${form}`, "DELETE");
              setText(Object.fromEntries(clauses.map((c) => [c.id, c.text])));
              setExtra("");
            }, "Back to Aeon's wording.")
          }
        >
          Use Aeon&rsquo;s wording
        </Button>
      </div>
      <Status message={message} />
    </div>
  );
}

const toDollars = (cents: number) => (cents / 100).toFixed(0);
const toCents = (d: string) => Math.max(0, Math.round(Number(d || 0) * 100));

export function PolicyEditor({ initial }: { initial: Policies }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [money, setMoney] = useState({ late: toDollars(initial.late_cancel_fee_cents), noShow: toDollars(initial.no_show_fee_cents), returned: toDollars(initial.returned_payment_fee_cents) });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const set = <K extends keyof Policies>(k: K, v: Policies[K]) => setP((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await send("/api/client-forms/policies", "PUT", {
        ...p,
        late_cancel_fee_cents: toCents(money.late),
        no_show_fee_cents: toCents(money.noShow),
        returned_payment_fee_cents: toCents(money.returned),
      });
      setMessage({ ok: true, text: "Saved. Every form now uses these." });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Cancel at least this many hours ahead" inputMode="numeric" value={String(p.cancel_hours)} onChange={(e) => set("cancel_hours", Math.min(168, Number(e.target.value.replace(/\D/g, "")) || 0))} />
        <TextField label="Late cancellation fee ($)" inputMode="decimal" value={money.late} onChange={(e) => setMoney((m) => ({ ...m, late: e.target.value.replace(/[^\d.]/g, "") }))} />
        <TextField label="Missed session fee ($)" inputMode="decimal" value={money.noShow} onChange={(e) => setMoney((m) => ({ ...m, noShow: e.target.value.replace(/[^\d.]/g, "") }))} />
        <TextField label="Returned payment fee ($)" inputMode="decimal" value={money.returned} onChange={(e) => setMoney((m) => ({ ...m, returned: e.target.value.replace(/[^\d.]/g, "") }))} />
        <TextField label="You reply to messages within (hours)" inputMode="numeric" value={String(p.reply_within_hours)} onChange={(e) => set("reply_within_hours", Math.min(168, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))} />
        <TextField label="Privacy contact (if not you)" value={p.privacy_officer} maxLength={120} onChange={(e) => set("privacy_officer", e.target.value)} />
        <TextField label="Colleague who contacts clients if you can't" value={p.backup_colleague} maxLength={160} onChange={(e) => set("backup_colleague", e.target.value)} />
        <DateField label="Privacy notice effective date" value={p.npp_effective_on} onChange={(v) => v && set("npp_effective_on", v)} compact={false} />
      </div>
      <SettingSwitch label="I take insurance" checked={p.accepts_insurance} onCheckedChange={(v) => set("accepts_insurance", v)} />
      <SettingSwitch label="I offer a sliding scale" checked={p.offers_sliding_scale} onCheckedChange={(v) => set("offers_sliding_scale", v)} />
      <SettingSwitch label="Clients may text me about appointments" checked={p.texting_ok} onCheckedChange={(v) => set("texting_ok", v)} />
      <div>
        <Button disabled={busy} onClick={save}>
          Save policies
        </Button>
      </div>
      <Status message={message} />
    </div>
  );
}
