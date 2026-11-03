"use client";

// Referrals › Calendar: one meeting's details in the side sheet (UI-040). Who it is
// with and their phone, the kind, when, where and her note, then what she can do:
// Reschedule (the shared DateField and a time; the length stays), Mark done, Cancel
// (asks first), Open partner, and Record a debrief after. Every refusal is the
// server's own words.

import { useState, type ReactNode } from "react";
import { CalendarClock, Check, ExternalLink, Mic, Phone, X } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DateField } from "@/components/shared/date-field";
import { SettingSelect } from "@/components/shared/settings-controls";
import { SideSheet } from "@/components/shared/side-sheet";
import { notify } from "@/components/shared/toaster";
import { Button, buttonClass } from "@/components/ui";
import { canMarkDone } from "@/lib/referrals/meeting-rules";
import { cancelMeeting, changeMeeting, type Meeting } from "./api";
import { dayKey, KIND_LABEL, timeOptions, wallInstant, wallTime, whenLabel, type Kind } from "./layout";
import type { CalendarPartner } from "./api";

const TIMES = timeOptions();

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 border-t border-[var(--hairline)] py-3 first:border-t-0">
      <dt className="text-small font-medium text-[var(--fg-muted)]">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function MeetingSheet({
  meeting,
  partner,
  timeZone,
  today,
  onClose,
  onChanged,
}: {
  meeting: Meeting | null;
  partner: CalendarPartner | null;
  timeZone: string;
  today: string;
  onClose: () => void;
  onChanged: (m: Meeting) => void;
}) {
  const [moving, setMoving] = useState(false);
  const [day, setDay] = useState("");
  const [dayError, setDayError] = useState("");
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  // A new meeting opened: start fresh.
  const [seen, setSeen] = useState<string | null>(null);
  if ((meeting?.id ?? null) !== seen) {
    setSeen(meeting?.id ?? null);
    setMoving(false);
    setError("");
    setDayError("");
    setConfirm(false);
    if (meeting) {
      setDay(dayKey(meeting.starts_at, timeZone));
      setTime(wallTime(meeting.starts_at, timeZone));
    }
  }

  async function run(work: () => Promise<Meeting>, done: string) {
    setBusy(true);
    setError("");
    try {
      const m = await work();
      onChanged(m);
      notify.success(done);
      setMoving(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function reschedule() {
    if (!meeting) return;
    if (dayError) return setError(dayError);
    if (!day) return setError("Pick a date.");
    const starts = wallInstant(day, time, timeZone);
    const length = Date.parse(meeting.ends_at) - Date.parse(meeting.starts_at);
    void run(() => changeMeeting(meeting.id, { starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + length).toISOString() }), "Meeting moved.");
  }

  const m = meeting;
  const title = m ? `${KIND_LABEL[m.kind as Kind]} with ${m.source_name}` : "Meeting";
  const planned = m?.status === "planned";
  // A meeting can be marked done only once it has started (never one still ahead).
  const started = m ? canMarkDone(m.starts_at) : false;
  // Plain links: they load the Referrals page fresh with that partner's panel open.
  const partnerHref = m ? `/referrals?partner=${m.source_id}` : "#";
  const debriefHref = m ? `/referrals?debrief=${m.source_id}` : "#";

  return (
    <>
      <SideSheet
        open={Boolean(m)}
        onOpenChange={(next) => !next && onClose()}
        title={title}
        description={m ? whenLabel(m, timeZone) : undefined}
        width="max-w-[560px]"
        footer={
          m && (
            <>
              {planned && (
                <Button variant="quiet" onClick={() => setMoving((v) => !v)} aria-expanded={moving} disabled={busy}>
                  <CalendarClock aria-hidden size={16} />
                  Reschedule
                </Button>
              )}
              {planned && started && (
                <Button variant="quiet" onClick={() => run(() => changeMeeting(m.id, { status: "done" }), "Marked done.")} disabled={busy}>
                  <Check aria-hidden size={16} />
                  Mark done
                </Button>
              )}
              {m.status !== "canceled" && (
                <Button variant="quiet" onClick={() => setConfirm(true)} disabled={busy}>
                  <X aria-hidden size={16} />
                  Cancel meeting
                </Button>
              )}
            </>
          )
        }
      >
        {m && (
          <>
            <dl className="flex flex-col">
              <Row label="With">
                <span className="font-medium">{m.source_name}</span>
                {partner?.organization && partner.organization !== m.source_name && <span className="block text-small text-[var(--fg-muted)]">{partner.organization}</span>}
              </Row>
              <Row label="Phone">
                {partner?.phone ? (
                  <a href={`tel:${partner.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-touch items-center gap-2 font-medium text-[var(--link)] underline-offset-2 hover:underline">
                    <Phone aria-hidden size={14} />
                    {partner.phone}
                  </a>
                ) : (
                  <span className="text-[var(--fg-muted)]">No phone saved</span>
                )}
              </Row>
              <Row label="Kind">{KIND_LABEL[m.kind as Kind]}</Row>
              <Row label="When">
                {whenLabel(m, timeZone)}
                {m.status === "done" && <span className="ml-2 rounded-full bg-[var(--status-done-bg)] px-2 py-0.5 text-small font-medium text-[var(--status-done-fg)]">Done</span>}
              </Row>
              <Row label="Where">{m.location ?? <span className="text-[var(--fg-muted)]">Not set</span>}</Row>
              <Row label="Notes">{m.notes ? <span className="whitespace-pre-line">{m.notes}</span> : <span className="text-[var(--fg-muted)]">No notes</span>}</Row>
            </dl>

            {moving && planned && (
              <section aria-label="Reschedule" className="flex flex-col gap-3 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <DateField label="New date" value={day} onChange={setDay} onValidity={setDayError} min={today} required />
                  <SettingSelect label="New time" value={time} onValueChange={setTime} options={TIMES} compact />
                </div>
                <p className="text-small text-[var(--fg-muted)]">It keeps its length. Times are in your practice&apos;s time zone.</p>
                <div>
                  <Button variant="accent" onClick={reschedule} disabled={busy || Boolean(dayError) || !day}>
                    Save new time
                  </Button>
                </div>
              </section>
            )}

            {error && (
              <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-bg)] px-4 py-3 text-small font-medium text-[var(--danger-fg)]">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <a href={partnerHref} className={buttonClass("quiet", "justify-start")}>
                <ExternalLink aria-hidden size={16} />
                Open partner
              </a>
              <a href={debriefHref} className={buttonClass("quiet", "justify-start")}>
                <Mic aria-hidden size={16} />
                Record a debrief after
              </a>
            </div>
          </>
        )}
      </SideSheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Cancel this meeting?"
        description={m ? `${title}, ${whenLabel(m, timeZone)}. It comes off your calendar. Nothing is sent: let them know yourself if they expect you.` : ""}
        confirmLabel="Cancel meeting"
        cancelLabel="Keep meeting"
        onConfirm={async () => {
          if (!m) return;
          const c = await cancelMeeting(m.id);
          onChanged(c);
          notify.success("Meeting canceled.");
        }}
      />
    </>
  );
}
