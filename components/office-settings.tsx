"use client";

import { useState } from "react";
import { INPUT } from "./gfe-timing-check";
import { Button } from "./ui";

// Her office hours (Good Faith Estimate due dates count only open days) and self-pay fees.

type Hours = { weekdays: number[]; closed_on: string[]; close_federal_holidays: boolean };
type Fee = { code: string; label: string; cents: number };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function OfficeSettings({ initialHours, initialFees }: { initialHours: Hours; initialFees: Fee[] }) {
  const [hours, setHours] = useState(initialHours);
  const [fees, setFees] = useState(initialFees.map((f) => ({ ...f, dollars: (f.cents / 100).toFixed(2) })));
  const [closedDate, setClosedDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const toggleDay = (d: number) =>
    setHours((h) => ({ ...h, weekdays: h.weekdays.includes(d) ? h.weekdays.filter((x) => x !== d) : [...h.weekdays, d].sort() }));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours,
          fees: fees.map((f) => ({ code: f.code.trim().toUpperCase(), label: f.label.trim(), cents: Math.round(Number(f.dollars) * 100) })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save. Try again.");
      setMessage({ ok: true, text: "Saved. New estimates use these hours and fees." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="hours-heading" className="flex flex-col gap-3">
        <h3 id="hours-heading" className="font-semibold">
          Days you’re open
        </h3>
        <div role="group" aria-label="Days you're open" className="flex flex-wrap gap-2">
          {DAYS.map((label, d) => {
            const on = hours.weekdays.includes(d);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDay(d)}
                className={`inline-flex h-chip min-w-14 items-center justify-center rounded-full px-4 text-small font-medium ${
                  on ? "bg-[var(--primary-bg)] text-[var(--primary-fg)]" : "border border-border bg-[var(--chip-off-bg)] text-[var(--fg)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {hours.weekdays.length === 0 && (
          <p role="alert" className="text-small" style={{ color: "var(--danger-fg)" }}>
            Pick at least one day.
          </p>
        )}
        <label className="flex min-h-touch items-center gap-3">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-accent)]"
            checked={hours.close_federal_holidays}
            onChange={(e) => setHours((h) => ({ ...h, close_federal_holidays: e.target.checked }))}
          />
          Closed on federal holidays
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-small font-medium">
            Another day you’re closed
            <input type="date" className={INPUT} value={closedDate} onChange={(e) => setClosedDate(e.target.value)} />
          </label>
          <Button
            type="button"
            variant="quiet"
            disabled={!closedDate || hours.closed_on.includes(closedDate)}
            onClick={() => {
              setHours((h) => ({ ...h, closed_on: [...h.closed_on, closedDate].sort() }));
              setClosedDate("");
            }}
          >
            Add
          </Button>
        </div>
        {hours.closed_on.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {hours.closed_on.map((d) => (
              <li key={d}>
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => setHours((h) => ({ ...h, closed_on: h.closed_on.filter((x) => x !== d) }))}
                >
                  {d} <span aria-hidden>×</span>
                  <span className="sr-only">Remove</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fees-heading" className="flex flex-col gap-3">
        <h3 id="fees-heading" className="font-semibold">
          Self-pay fees
        </h3>
        {fees.map((f, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_8rem_auto] sm:items-end">
            <label className="flex flex-col gap-1 text-small">
              Code
              <input className={INPUT} value={f.code} onChange={(e) => setFees((fs) => fs.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} />
            </label>
            <label className="flex flex-col gap-1 text-small">
              What it is
              <input className={INPUT} value={f.label} onChange={(e) => setFees((fs) => fs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Fee ($)
              <input
                type="number"
                min={0}
                step="0.01"
                className={INPUT}
                value={f.dollars}
                onChange={(e) => setFees((fs) => fs.map((x, j) => (j === i ? { ...x, dollars: e.target.value } : x)))}
              />
            </label>
            <Button type="button" variant="quiet" onClick={() => setFees((fs) => fs.filter((_, j) => j !== i))}>
              Remove<span className="sr-only"> {f.code}</span>
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="quiet" onClick={() => setFees((fs) => [...fs, { code: "", label: "", cents: 0, dollars: "" }])}>
            Add a fee
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" disabled={busy || hours.weekdays.length === 0} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {message && (
          <p role={message.ok ? "status" : "alert"} className="text-small font-medium" style={message.ok ? undefined : { color: "var(--danger-fg)" }}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
