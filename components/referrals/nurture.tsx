"use client";

// Keeping in touch, on the Referrals board: the "Going cold" line and the
// reciprocity line on each card, "I referred someone to them" (a date and how
// many people, never who), her notes about the people she refers to, the
// board's views (whole board, going cold, people I refer to) and the
// "People I refer to" list grouped by kind.

import { useState } from "react";
import { notify } from "@/components/shared/toaster";
import { DateField } from "@/components/shared/date-field";
import { SettingSelect, TextField } from "@/components/shared/settings-controls";
import { Button, chipClass } from "@/components/ui";
import { REFERRED_OUT_NOTE } from "@/lib/referrals/contact-kinds";
import type { Contact } from "@/lib/referrals/contacts";
import {
  hasReferOutNotes,
  reciprocity,
  REFER_OUT_LABEL,
  REFER_OUT_LIMITS,
  type GoingCold,
  type ReferOutNotes,
} from "@/lib/referrals/nurture";
import type { ReferralSource } from "@/lib/referrals/store";
import type { CardView } from "./contact-log";

const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";
const COUNT_OPTIONS = ["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n === "1" ? "1 person" : `${n} people` }));

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function GoingColdLine({ cold }: { cold: GoingCold | undefined }) {
  if (!cold) return null;
  return (
    <p
      data-testid="going-cold"
      className="rounded-[12px] bg-[var(--status-pending-bg)] px-3 py-2 text-small font-medium text-[var(--status-pending-fg)]"
    >
      {cold.label}. Aim for {cold.cadence}.
    </p>
  );
}

/** "They've referred N · You've referred M": counts from dates only, never who. */
export function ReciprocityLine({ contacts }: { contacts: Contact[] }) {
  return (
    <p data-testid="reciprocity" className="text-small font-medium">
      {reciprocity(contacts).line}
    </p>
  );
}

/** Her notes about someone she refers to, read-only. */
function NotesList({ notes }: { notes: ReferOutNotes | undefined }) {
  if (!hasReferOutNotes(notes)) return null;
  return (
    <dl className="grid grid-cols-1 gap-y-1 text-small">
      {(Object.keys(REFER_OUT_LABEL) as (keyof ReferOutNotes)[]).map((k) =>
        notes?.[k] ? (
          <div key={k}>
            <dt className="inline font-medium">{REFER_OUT_LABEL[k]}: </dt>
            <dd className="inline text-[var(--fg-muted)]">{notes[k]}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

/**
 * On each card: log that she referred someone to them (how many and when, nothing
 * else) and keep her notes about them for referring out.
 */
export function ReferOutBox({
  card,
  notes,
  onLogged,
  onNotes,
}: {
  card: ReferralSource;
  notes: ReferOutNotes | undefined;
  onLogged: (view: CardView, said: string) => void;
  onNotes: (id: string, notes: ReferOutNotes, said: string) => void;
}) {
  const [count, setCount] = useState("1");
  const [on, setOn] = useState(localToday());
  const [availability, setAvailability] = useState(notes?.availability ?? "");
  const [fees, setFees] = useState(notes?.fees ?? "");
  const [insurance, setInsurance] = useState(notes?.insurance ?? "");
  const [busy, setBusy] = useState(false);

  async function send(method: "POST" | "PUT", body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/referrals/${card.id}/refer-out`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Partial<CardView> & { notes?: ReferOutNotes; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save that. Try again.");
      return data;
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Couldn't save that.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function logOut(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(count);
    const data = await send("POST", { count: n, happened_on: on });
    if (data?.card && data.tier && data.contacts) {
      onLogged(data as CardView, `Logged that you referred ${n === 1 ? "1 person" : `${n} people`} to ${card.name}. Only the date and the count are kept.`);
    }
  }

  async function saveNotes(e: React.FormEvent) {
    e.preventDefault();
    const data = await send("PUT", { availability, fees, insurance });
    if (data?.notes) onNotes(card.id, data.notes, `Saved your notes about referring to ${card.name}.`);
  }

  return (
    <details className="rounded-[16px] border border-[var(--hairline)] px-3 text-small">
      <summary className="min-h-11 cursor-pointer py-3 font-medium text-[var(--link)]">Referring out to them</summary>
      <div className="flex flex-col gap-3 pb-3">
        <form onSubmit={logOut} className="flex flex-col gap-2">
          <SettingSelect compact label="How many people" value={count} onValueChange={setCount} options={COUNT_OPTIONS} />
          <DateField compact label="When you referred" value={on} onChange={setOn} max={localToday()} required />
          <p className="text-[var(--fg-muted)]">{REFERRED_OUT_NOTE}</p>
          <Button type="submit" variant="accent" disabled={busy} aria-label={`I referred someone to ${card.name}`}>
            I referred someone to them
          </Button>
        </form>
        <form onSubmit={saveNotes} className="flex flex-col gap-2">
          <p className="font-medium">Your notes about them (no client details)</p>
          <TextField compact label={REFER_OUT_LABEL.availability} value={availability} onChange={(e) => setAvailability(e.target.value)} maxLength={REFER_OUT_LIMITS.availability} />
          <TextField compact label={REFER_OUT_LABEL.fees} value={fees} onChange={(e) => setFees(e.target.value)} maxLength={REFER_OUT_LIMITS.fees} />
          <TextField compact label={REFER_OUT_LABEL.insurance} value={insurance} onChange={(e) => setInsurance(e.target.value)} maxLength={REFER_OUT_LIMITS.insurance} />
          <Button type="submit" variant="quiet" disabled={busy}>
            Save notes
          </Button>
        </form>
      </div>
    </details>
  );
}

export type BoardView = "board" | "cold" | "refer_out";

/** Whole board, going cold, or the people she refers to. Toggle buttons, 44px, wrapping on a phone. */
export function BoardViews({ value, onChange, cold, referOut }: { value: BoardView; onChange: (v: BoardView) => void; cold: number; referOut: number }) {
  const views: { id: BoardView; label: string; count?: number }[] = [
    { id: "board", label: "Whole board" },
    { id: "cold", label: "Going cold", count: cold },
    { id: "refer_out", label: "People I refer to", count: referOut },
  ];
  return (
    <div role="group" aria-label="Board view" className="flex min-w-0 flex-wrap gap-2">
      {views.map((v) => (
        <button key={v.id} type="button" aria-pressed={value === v.id} onClick={() => onChange(v.id)} className={chipClass(value === v.id, true, FOCUS)}>
          {v.label}
          {v.count !== undefined && <span className="ml-1.5 tabular-nums">{v.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** "People I refer to", grouped by kind of provider, with her notes about each and the reciprocity line. */
export function ReferOutList({
  cards,
  contacts,
  notes,
}: {
  cards: ReferralSource[];
  contacts: Record<string, Contact[]>;
  notes: Record<string, ReferOutNotes>;
}) {
  if (!cards.length) {
    return (
      <p className="rounded-[20px] border border-dashed border-[var(--hairline)] p-4 text-small text-[var(--fg-muted)]">
        Nobody yet. On a card, open Referring out to them and press I referred someone to them, or save your notes about them.
      </p>
    );
  }
  const groups = new Map<string, ReferralSource[]>();
  for (const c of cards) {
    const kind = c.specialty ?? c.taxonomy ?? "Other";
    groups.set(kind, [...(groups.get(kind) ?? []), c]);
  }
  return (
    <section aria-labelledby="refer-out-heading" className="flex flex-col gap-4">
      <h3 id="refer-out-heading" className="font-semibold">
        People I refer to
      </h3>
      {[...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([kind, list]) => (
          <div key={kind} className="flex flex-col gap-2">
            <h4 className="text-small font-semibold text-[var(--fg-muted)]">{kind}</h4>
            <ul className="flex flex-col divide-y divide-[var(--hairline)] rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)]">
              {list.map((c) => (
                <li key={c.id} aria-label={c.name} className="flex flex-col gap-1 p-4">
                  <p className="font-semibold break-words">{c.name}</p>
                  {c.phone && <p className="text-small text-[var(--fg-muted)]">{c.phone}</p>}
                  <ReciprocityLine contacts={contacts[c.id] ?? []} />
                  <NotesList notes={notes[c.id]} />
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
