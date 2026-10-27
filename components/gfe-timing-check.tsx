"use client";

import { useState } from "react";
import { gfeDueDate, type GfeDue, type OpenDays } from "@/lib/gfe/timing";
import { formatDate } from "./deadline-card";

// Try any booking: when would the Good Faith Estimate be due?

const INPUT =
  "h-input w-full rounded-full border border-border bg-[var(--chip-off-bg)] px-5 text-body text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";

export function GfeTimingCheck({ open, initial }: { open: OpenDays; initial: { bookedOn: string; visitOn: string } }) {
  const [bookedOn, setBookedOn] = useState(initial.bookedOn);
  const [visitOn, setVisitOn] = useState(initial.visitOn);
  const [requestedOn, setRequestedOn] = useState("");

  let due: GfeDue | null = null;
  let error = "";
  try {
    if (requestedOn) due = gfeDueDate({ kind: "requested", requestedOn }, open);
    else if (bookedOn && visitOn) due = gfeDueDate({ kind: "scheduled", scheduledOn: bookedOn, serviceOn: visitOn }, open);
  } catch (e) {
    error = e instanceof Error ? e.message : "Check the dates.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-small font-medium">
          Booked on
          <input type="date" className={INPUT} value={bookedOn} onChange={(e) => setBookedOn(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
          Visit on
          <input type="date" className={INPUT} value={visitOn} onChange={(e) => setVisitOn(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-small font-medium">
          Or: client asked on
          <input type="date" className={INPUT} value={requestedOn} onChange={(e) => setRequestedOn(e.target.value)} />
        </label>
      </div>
      <p aria-live="polite" className="text-body">
        {error ? (
          error
        ) : !due ? (
          "Pick dates to see when it's due."
        ) : due.dueOn ? (
          <>
            Give it by <strong>{formatDate(due.dueOn)}</strong>. {due.explain}
            {due.leadDays !== null && <> The visit is {due.leadDays} open days out.</>}
          </>
        ) : (
          due.explain
        )}
      </p>
      {due && <p className="text-small text-[var(--fg-muted)]">Rule: {due.rule}</p>}
    </div>
  );
}
