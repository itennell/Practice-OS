"use client";

import { useState } from "react";
import { CalcomCard, type CalcomCardStatus } from "@/components/connections/calcom-card";
import { SettingRadio } from "@/components/shared/settings-controls";
import { notify } from "@/components/shared/toaster";
import { ButtonLink } from "@/components/ui";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/frontdesk/calendar/google";

// Which calendar Front Desk books consults on: Cal.com or Google, her choice.
// Google's sign-in is the app's shared Connect Google (desktop-app's lib/connect),
// asking only for calendar events and free/busy.

type Provider = "calcom" | "google";

export function CalendarCard({ initial }: { initial: { provider: Provider | null; calcom: CalcomCardStatus; google: { connected: boolean; label?: string; fix?: string } } }) {
  const [provider, setProvider] = useState<Provider>(initial.provider ?? "calcom");

  const choose = async (next: Provider) => {
    const before = provider;
    setProvider(next);
    const res = await fetch("/api/front-desk/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "choose", provider: next }) }).catch(() => null);
    if (!res?.ok) {
      setProvider(before);
      notify.error("Couldn't save that.", { description: "Nothing changed." });
    }
  };

  const googleStart = `/api/connect/google/start?scopes=${encodeURIComponent(GOOGLE_CALENDAR_SCOPES.join(","))}`;

  return (
    <section aria-labelledby="calendar-card-title" className="tile flex flex-col gap-4 p-5 md:p-6">
      <h2 id="calendar-card-title" className="text-section">
        Your consult calendar
      </h2>
      <SettingRadio
        label="Where should Front Desk book consults?"
        value={provider}
        onValueChange={choose}
        options={[
          { value: "calcom", label: "Cal.com", description: "Uses your consult event type and its open times." },
          { value: "google", label: "Google Calendar", description: "Uses your open days, 9 am to 5 pm, around what's already on your calendar." },
        ]}
      />
      {provider === "calcom" ? (
        <CalcomCard initial={initial.calcom} />
      ) : initial.google.connected && initial.provider === "google" ? (
        <div className="flex flex-col gap-2">
          <p className="font-medium">{initial.google.label ?? "Google Calendar connected"}</p>
          {initial.google.fix && (
            <p role="alert" className="text-[var(--danger-fg)]">
              {initial.google.fix}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="max-w-[60ch] text-[var(--fg-muted)]">
            Press the button, sign in with Google and allow Practice-OS to see when you&apos;re busy and add consults. Only &quot;Phone consult&quot; and a reference number go on your calendar.
          </p>
          <ButtonLink href={googleStart} variant="primary" className="self-start">
            Connect Google Calendar
          </ButtonLink>
        </div>
      )}
    </section>
  );
}
