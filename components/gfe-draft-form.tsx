"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { gfeDueDate, type GfeDue, type OpenDays } from "@/lib/gfe/timing";
import { formatDate } from "./deadline-card";
import { INPUT } from "./gfe-timing-check";
import { Button } from "./ui";

// A new Good Faith Estimate: dates, type of care and services from her fee
// list. No client names here; she types those only when she makes the PDF.

type Fee = { code: string; label: string; cents: number };
type Line = { code: string; quantity: number; location: "office" | "telehealth" | "either" };

const KINDS = { individual: "Individual therapy", couples: "Couples therapy", family: "Family therapy", group: "Group therapy" };
const LOCATIONS = { either: "Office or telehealth", office: "In the office", telehealth: "Telehealth" };
const FREQUENCIES = { "": "One-time", weekly: "Once a week", every_2_weeks: "Every 2 weeks", monthly: "Once a month" };

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function GfeDraftForm({ fees, open, today }: { fees: Fee[]; open: OpenDays; today: string }) {
  const router = useRouter();
  const [basis, setBasis] = useState<"scheduled" | "requested">("scheduled");
  const [scheduledOn, setScheduledOn] = useState(today);
  const [serviceOn, setServiceOn] = useState("");
  const [requestedOn, setRequestedOn] = useState(today);
  const [kind, setKind] = useState<keyof typeof KINDS>("individual");
  const [frequency, setFrequency] = useState<keyof typeof FREQUENCIES>("weekly");
  const [lines, setLines] = useState<Line[]>(
    fees.length ? [{ code: fees[0].code, quantity: 1, location: "either" }] : [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (fees.length === 0) {
    return (
      <p>
        Add your self-pay fees in{" "}
        <a href="/settings" className="text-[var(--link)] underline underline-offset-2">
          Settings
        </a>{" "}
        first. Estimates use them.
      </p>
    );
  }

  let due: GfeDue | null = null;
  try {
    if (basis === "requested" && requestedOn) due = gfeDueDate({ kind: "requested", requestedOn }, open);
    if (basis === "scheduled" && scheduledOn && serviceOn) due = gfeDueDate({ kind: "scheduled", scheduledOn, serviceOn }, open);
  } catch {
    due = null;
  }
  const total = lines.reduce((s, l) => s + l.quantity * (fees.find((f) => f.code === l.code)?.cents ?? 0), 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/gfe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basis,
          ...(basis === "scheduled" ? { scheduled_on: scheduledOn, service_on: serviceOn } : { requested_on: requestedOn }),
          service_kind: kind,
          lines,
          frequency: frequency || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; reference?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save it. Try again.");
      setMessage({ ok: true, text: `Saved as ${body.reference}. It's waiting in Approvals.` });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save it. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-small font-medium">Why are you making it?</legend>
        {(["scheduled", "requested"] as const).map((b) => (
          <label key={b} className="flex min-h-touch items-center gap-2">
            <input type="radio" name="basis" checked={basis === b} onChange={() => setBasis(b)} className="size-5 accent-[var(--color-accent)]" />
            {b === "scheduled" ? "A visit was booked" : "The client asked for one"}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        {basis === "scheduled" ? (
          <>
            <label className="flex flex-col gap-1 text-small font-medium">
              Booked on
              <input type="date" required className={INPUT} value={scheduledOn} onChange={(e) => setScheduledOn(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium">
              First visit
              <input type="date" required className={INPUT} value={serviceOn} onChange={(e) => setServiceOn(e.target.value)} />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-small font-medium">
            Client asked on
            <input type="date" required className={INPUT} value={requestedOn} onChange={(e) => setRequestedOn(e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-small font-medium">
          Type of care
          <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as keyof typeof KINDS)}>
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
          How often
          <select className={INPUT} value={frequency} onChange={(e) => setFrequency(e.target.value as keyof typeof FREQUENCIES)}>
            {Object.entries(FREQUENCIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-small font-medium">Services (from your fee list)</legend>
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,1fr)_auto] sm:items-end">
            <label className="flex flex-col gap-1 text-small">
              Service {i + 1}
              <select className={INPUT} value={l.code} onChange={(e) => setLine(i, { code: e.target.value })}>
                {fees.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.code} {f.label} ({dollars(f.cents)})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small">
              How many
              <input
                type="number"
                min={1}
                max={366}
                className={INPUT}
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Where
              <select className={INPUT} value={l.location} onChange={(e) => setLine(i, { location: e.target.value as Line["location"] })}>
                {Object.entries(LOCATIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="quiet" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              Remove<span className="sr-only"> service {i + 1}</span>
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="quiet"
            disabled={lines.length >= 20}
            onClick={() => setLines((ls) => [...ls, { code: fees[0].code, quantity: 1, location: "either" }])}
          >
            Add a service
          </Button>
        </div>
      </fieldset>

      <p aria-live="polite">
        Total <strong>{dollars(total)}</strong>
        {due && (
          <>
            {" · "}
            {due.dueOn ? (
              <>
                Give it to the client by <strong>{formatDate(due.dueOn)}</strong>
              </>
            ) : (
              "No deadline at booking"
            )}
            {due.leadDays !== null && ` (the visit is ${due.leadDays} open days out)`}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Send to Approvals"}
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
