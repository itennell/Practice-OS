"use client";

// Referrals › Calendar: "+ Plan a meeting" in the side sheet (UI-040). Who (her
// board, without Not a fit, do-not-contact or sensitive cards), the kind, the date
// (the shared DateField) and time, how long, where, and a note. The server checks
// everything again and its refusals show here in its own plain words: a time that
// has passed, a clash, do-not-contact, or a client detail or something of value in
// the note or the place. Nothing is sent to anyone.

import { useState, type FormEvent } from "react";
import { DateField } from "@/components/shared/date-field";
import { SettingSelect, TextAreaField, TextField } from "@/components/shared/settings-controls";
import { SideSheet } from "@/components/shared/side-sheet";
import { notify } from "@/components/shared/toaster";
import { Button } from "@/components/ui";
import { planMeeting, type Meeting } from "./api";
import { DURATIONS, durationLabel, KIND_LABEL, KIND_MINUTES, KINDS, nextFreeStart, timeOptions, wallInstant, type Kind } from "./layout";
import type { CalendarPartner } from "./api";

const TIMES = timeOptions();
const KIND_OPTIONS = KINDS.filter((k) => k !== "other")
  .map((k) => ({ value: k as string, label: KIND_LABEL[k] }))
  .concat({ value: "other", label: "Something else" });

export type PlanStart = { partnerId: string | null; day: string | null; time?: string };

export function PlanSheet({
  start,
  partners,
  timeZone,
  today,
  onClose,
  onPlanned,
}: {
  /** Open with these picked; null keeps the sheet closed. */
  start: PlanStart | null;
  partners: CalendarPartner[];
  timeZone: string;
  today: string;
  onClose: () => void;
  onPlanned: (m: Meeting) => void;
}) {
  const allowed = partners.filter((p) => !p.blocked);
  const [partner, setPartner] = useState("");
  const [kind, setKind] = useState<Kind>("coffee");
  const [day, setDay] = useState("");
  const [dayError, setDayError] = useState("");
  const [time, setTime] = useState("10:00");
  const [minutes, setMinutes] = useState(String(KIND_MINUTES.coffee));
  const [lengthTouched, setLengthTouched] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Each time the sheet opens, start from what was picked (a partner from Partners, a day from the month).
  const [seen, setSeen] = useState<PlanStart | null>(null);
  if (start !== seen) {
    setSeen(start);
    if (start) {
      const free = nextFreeStart(new Date(), timeZone);
      const picked = start.partnerId ? partners.find((p) => p.id === start.partnerId) : null;
      setPartner(picked && !picked.blocked ? picked.id : "");
      setError(picked?.blocked ? `${picked.name} is ${picked.blocked}, so a meeting can't be planned with them here.` : "");
      setKind("coffee");
      setMinutes(String(KIND_MINUTES.coffee));
      setLengthTouched(false);
      const d = start.day && start.day >= today ? start.day : free.day;
      setDay(d);
      setDayError("");
      setTime(start.time ?? (d === free.day ? free.time : "10:00"));
      setLocation("");
      setNotes("");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!partner) return setError("Pick who the meeting is with.");
    // A typed date with a problem never books (the field empties its value; this says why).
    if (dayError) return setError(dayError);
    if (!day) return setError("Pick a date.");
    const starts = wallInstant(day, time, timeZone);
    const ends = new Date(starts.getTime() + Number(minutes) * 60_000);
    setBusy(true);
    setError("");
    try {
      const m = await planMeeting({ source_id: partner, kind, starts_at: starts.toISOString(), ends_at: ends.toISOString(), location: location.trim() || null, notes: notes.trim() || null });
      notify.success("Meeting planned. Nothing was sent.");
      onPlanned(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SideSheet
      open={Boolean(start)}
      onOpenChange={(next) => !next && onClose()}
      title="Plan a meeting"
      description="It goes on your calendar only. Nothing is sent: you invite them yourself."
      width="max-w-[520px]"
    >
      <form aria-label="Plan a meeting" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {allowed.length ? (
          <SettingSelect
            label="With"
            value={partner}
            onValueChange={(v) => {
              setPartner(v);
              setError("");
            }}
            options={[{ value: "", label: "Pick a partner" }, ...allowed.map((p) => ({ value: p.id, label: p.name }))]}
            compact
          />
        ) : (
          <p className="text-small text-[var(--fg-muted)]">There&apos;s no one on your board to meet yet. Add partners first.</p>
        )}
        <SettingSelect
          label="Kind"
          value={kind}
          onValueChange={(v) => {
            setKind(v as Kind);
            if (!lengthTouched) setMinutes(String(KIND_MINUTES[v as Kind]));
          }}
          options={KIND_OPTIONS}
          compact
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="Date" value={day} onChange={setDay} onValidity={setDayError} min={today} required />
          <SettingSelect label="Time" value={time} onValueChange={setTime} options={TIMES} compact />
        </div>
        <SettingSelect
          label="How long"
          value={minutes}
          onValueChange={(v) => {
            setMinutes(v);
            setLengthTouched(true);
          }}
          options={DURATIONS.map((d) => ({ value: String(d), label: durationLabel(d) }))}
          compact
        />
        <TextField label="Where" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="A cafe, their office, Phone, Zoom" maxLength={200} compact />
        <TextAreaField
          label="Notes"
          description="For you: what to bring, where to park. No client details."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          compact
        />
        <p className="text-small text-[var(--fg-muted)]">Times are in your practice&apos;s time zone.</p>
        {error && (
          <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-bg)] px-4 py-3 text-small font-medium text-[var(--danger-fg)]">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" variant="accent" disabled={busy || !allowed.length || Boolean(dayError)}>
            {busy ? "Planning…" : "Plan meeting"}
          </Button>
        </div>
      </form>
    </SideSheet>
  );
}
