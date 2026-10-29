"use client";

import { CalendarDays } from "lucide-react";
import { CalcomCard, type CalcomCardStatus } from "@/components/connections/calcom-card";
import { ConnectionCardFrame } from "@/components/connections/card-frame";

// Front Desk books free consults on Cal.com. Cal.com reads her Google busy times
// itself, so a Google Calendar option waits until after the hackathon.
export function CalendarCard({ initial }: { initial: { calcom: CalcomCardStatus } }) {
  return (
    <ConnectionCardFrame
      icon={<CalendarDays className="size-5" />}
      title="Consult calendar"
      description="Front Desk offers callers open times from your Cal.com and books the one they pick."
      connected={initial.calcom.connected}
    >
      <div className="flex basis-full flex-col gap-4">
        <CalcomCard initial={initial.calcom} />
        <p className="text-small text-[var(--fg-muted)]">Google Calendar: coming later. Cal.com can already check your Google calendar for busy times.</p>
      </div>
    </ConnectionCardFrame>
  );
}
