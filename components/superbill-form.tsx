"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateField } from "./shared/date-field";
import { SettingSelect, TextField } from "./shared/settings-controls";
import { Button } from "./ui";

// A superbill by hand: sessions, codes, place of service and what was paid.
// No client details here: the PDF leaves them as blank boxes she fills in.
// Aeon's chat does the same through the draft_superbill tool.

type Fee = { code: string; label: string; cents: number };
type Cpt = { code: string; label: string };
type Line = { date_of_service: string; cpt: string; pos: "11" | "10" | "02"; modifier: "" | "95" | "93"; dollars: string };

const PLACES = { "11": "Office (11)", "10": "Video, client home (10)", "02": "Video, elsewhere (02)" };
const MODS = { "": "None", "95": "95 video", "93": "93 audio only" };

const cents = (dollars: string) => Math.round(Number(dollars.replace(/[$,]/g, "")) * 100);
const asDollars = (c: number) => (c / 100).toFixed(2);

export function SuperbillForm({ cpts, fees, today }: { cpts: Cpt[]; fees: Fee[]; today: string }) {
  const router = useRouter();
  const feeFor = (code: string) => fees.find((f) => f.code === code)?.cents;
  const blank = (cpt = "90837"): Line => ({
    date_of_service: today,
    cpt,
    pos: "10",
    modifier: "95",
    dollars: feeFor(cpt) !== undefined ? asDollars(feeFor(cpt)!) : "",
  });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [paid, setPaid] = useState("0.00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, ...patch };
        // An office visit takes no telehealth modifier; telehealth defaults to 95.
        if (patch.pos === "11") next.modifier = "";
        if (patch.pos && patch.pos !== "11" && !l.modifier) next.modifier = "95";
        if (patch.cpt && feeFor(patch.cpt) !== undefined) next.dollars = asDollars(feeFor(patch.cpt)!);
        return next;
      }),
    );
  const total = lines.reduce((s, l) => s + (cents(l.dollars) || 0), 0);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/superbills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({ date_of_service: l.date_of_service, cpt: l.cpt, pos: l.pos, modifier: l.modifier || null, cents: cents(l.dollars) })),
          paid_cents: cents(paid) || 0,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; reference?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save it. Try again.");
      setMessage({ ok: true, text: `Saved as ${body.reference}. Download the PDF below and fill in the client's details.` });
      setLines([blank()]);
      setPaid("0.00");
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save it. Try again." });
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
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-small font-medium">Sessions</legend>
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[9.5rem_minmax(0,2fr)_minmax(0,1.6fr)_8rem_7rem_auto] sm:items-end">
            <DateField label={`Date ${i + 1}`} required max={today} value={l.date_of_service} onChange={(iso) => setLine(i, { date_of_service: iso })} />
            <SettingSelect
              compact
              label="Service"
              value={l.cpt}
              onValueChange={(v) => setLine(i, { cpt: v })}
              options={cpts.map((c) => ({ value: c.code, label: `${c.code} ${c.label}` }))}
            />
            <SettingSelect
              compact
              label="Where"
              value={l.pos}
              onValueChange={(v) => setLine(i, { pos: v })}
              options={Object.entries(PLACES).map(([k, v]) => ({ value: k as Line["pos"], label: v }))}
            />
            <SettingSelect
              compact
              label="Modifier"
              value={l.modifier}
              disabled={l.pos === "11"}
              onValueChange={(v) => setLine(i, { modifier: v })}
              options={Object.entries(MODS).map(([k, v]) => ({ value: k as Line["modifier"], label: v }))}
            />
            <TextField compact label="Fee ($)" inputMode="decimal" required value={l.dollars} onChange={(e) => setLine(i, { dollars: e.target.value })} />
            <Button type="button" variant="quiet" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              Remove<span className="sr-only"> session {i + 1}</span>
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="quiet" disabled={lines.length >= 31} onClick={() => setLines((ls) => [...ls, { ...ls[ls.length - 1] }])}>
            Add a session
          </Button>
        </div>
      </fieldset>

      <TextField compact wrapClassName="max-w-xs" label="Client already paid ($)" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} />

      <p aria-live="polite">
        Total <strong>${asDollars(total)}</strong> · Balance <strong>${asDollars(Math.max(0, total - (cents(paid) || 0)))}</strong>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save superbill"}
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

export function MarkGiven({ id, reference }: { id: string; reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="quiet"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/superbills/${id}/given`, { method: "POST" });
          setBusy(false);
          if (!res.ok) setError("Couldn't save that. Try again.");
          else router.refresh();
        }}
      >
        {busy ? "Saving…" : "Mark given"}
        <span className="sr-only"> for {reference}</span>
      </Button>
      {error && (
        <p role="alert" className="text-small font-medium" style={{ color: "var(--danger-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
