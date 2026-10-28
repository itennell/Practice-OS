"use client";

import { useState } from "react";
import { gfeDueDate, type GfeDue, type OpenDays } from "@/lib/gfe/timing";
import { formatDate } from "./deadline-card";
import { DateField } from "./shared/date-field";

// Try any booking: when would the Good Faith Estimate be due?

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
        <DateField label="Booked on" value={bookedOn} onChange={setBookedOn} />
        <DateField label="Visit on" value={visitOn} onChange={setVisitOn} />
        <DateField label="Or: client asked on" clearable value={requestedOn} onChange={setRequestedOn} />
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
