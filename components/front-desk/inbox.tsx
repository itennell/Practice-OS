"use client";

import { CalendarCheck, Eye, MessageSquare, MessageSquareReply, Phone, PhoneMissed, Play, Voicemail } from "lucide-react";
import { useState } from "react";
import { notify } from "@/components/shared/toaster";
import { StatusPill, type Status } from "@/components/shared/status-mark";
import { Button } from "@/components/ui";
import type { InboxItem } from "@/lib/frontdesk/inbox";

// The Front Desk inbox rows: one hairline list, newest first. Logistics words
// only, never a caller's mood (HB 1806). Numbers stay masked until she asks.

const KIND_LABEL: Record<InboxItem["kind"], string> = {
  call: "Call",
  voicemail: "Voicemail",
  text_in: "Text from caller",
  text_out: "Text sent",
  booking: "Consult booked",
};

const STATUS: Record<NonNullable<InboxItem["status"]>, { status: Status; label: string }> = {
  new: { status: "pending", label: "New" },
  options_sent: { status: "running", label: "Options sent" },
  booked: { status: "done", label: "Booked" },
  needs_clinician: { status: "pending", label: "Needs you" },
  closed: { status: "declined", label: "Closed" },
};

const PRIVATE_WORDS: Record<string, string> = {
  client_name: "a name",
  contact: "a phone number or email",
  birth_date: "a birth date",
  identifier: "an ID number",
  diagnosis: "a health detail",
  address: "an address",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const length = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : null);

function KindIcon({ item }: { item: InboxItem }) {
  const Icon =
    item.kind === "call" ? (item.seconds ? Phone : PhoneMissed) : item.kind === "voicemail" ? Voicemail : item.kind === "text_in" ? MessageSquare : item.kind === "text_out" ? MessageSquareReply : CalendarCheck;
  return (
    <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-border bg-[var(--chip-off-bg)]">
      <Icon size={16} />
    </span>
  );
}

function Caller({ item }: { item: InboxItem }) {
  const [shown, setShown] = useState<string | null>(null);
  const reveal = async () => {
    const res = await fetch("/api/front-desk/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { number?: string; error?: string } | null;
    if (out?.number) setShown(out.number);
    else notify.error("Couldn't show the number.", { description: out?.error ?? "Try again." });
  };
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <span className="font-medium">
        {item.isSample && "[Sample] "}
        {item.name ? `${item.name} · ` : ""}
        <span className="tabular-nums">{shown ?? item.caller}</span>
      </span>
      {item.hasNumber && !shown && (
        <button type="button" onClick={reveal} className="inline-flex min-h-touch items-center gap-1 rounded-full px-2 text-small text-[var(--link)] underline-offset-2 hover:underline">
          <Eye aria-hidden size={14} /> Show number
        </button>
      )}
    </span>
  );
}

function Recording({ item }: { item: InboxItem }) {
  const [src, setSrc] = useState<string | null>(null);
  if (!item.playable) return null;
  if (src) return <audio controls autoPlay src={src} className="h-11 w-full max-w-sm" aria-label="Voicemail recording" />;
  return (
    <Button variant="quiet" onClick={() => setSrc(`/api/front-desk/recordings/${item.id}`)} className="self-start">
      <Play aria-hidden size={16} /> Play voicemail
    </Button>
  );
}

function SafetyLine({ item }: { item: InboxItem }) {
  if (!item.safety) return null;
  if (item.safety.crisis) {
    return <p className="text-small font-semibold text-[var(--danger-fg)]">Safety check: urgent. The caller got the fixed 988 reply and you got an alert.</p>;
  }
  const found = item.safety.private.map((k) => PRIVATE_WORDS[k]).filter(Boolean);
  return (
    <p className="text-small text-[var(--fg-muted)]">
      Safety check: clear.{found.length > 0 ? ` Has ${found.join(", ")}; kept here only, never in Aeon's memory.` : ""}
    </p>
  );
}

export function InboxList({ items }: { items: InboxItem[] }) {
  if (items.length === 0) return <p className="text-[var(--fg-muted)]">Nothing here yet. Calls, voicemails and texts show up after each check.</p>;
  return (
    <ul className="flex flex-col divide-y divide-[var(--hairline)]">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="flex gap-3 py-4" data-testid="inbox-row" data-kind={item.kind}>
          <KindIcon item={item} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <Caller item={item} />
              <span className="text-small text-[var(--fg-muted)]">{when(item.at)}</span>
            </div>
            <span className="text-small text-[var(--fg-muted)]">
              {KIND_LABEL[item.kind]}
              {item.kind === "call" && (item.seconds ? ` · ${length(item.seconds)}, no voicemail` : " · missed, no voicemail")}
              {item.kind === "voicemail" && length(item.seconds) ? ` · ${length(item.seconds)}` : ""}
              {item.kind === "text_out" && item.dryRun ? " · logged only, not sent (test mode)" : ""}
              {item.kind === "booking" && item.startsAt ? ` · ${when(item.startsAt)}${item.reference ? ` · ${item.reference}` : ""}` : ""}
              {item.crisis && <span className="ml-2 font-semibold text-[var(--danger-fg)]">Urgent</span>}
            </span>
            {item.kind !== "call" && item.kind !== "booking" && <p className="max-w-[65ch] whitespace-pre-line break-words">{item.body}</p>}
            {item.kind === "voicemail" && <Recording item={item} />}
            <SafetyLine item={item} />
          </div>
          {item.status && item.kind !== "text_out" && item.kind !== "call" && (
            <StatusPill status={STATUS[item.status].status} className="hidden self-start sm:inline-flex">
              {STATUS[item.status].label}
            </StatusPill>
          )}
        </li>
      ))}
    </ul>
  );
}
