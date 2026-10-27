import Link from "next/link";
import type { ObligationView } from "@/lib/compliance/view";

// One item on the Deadlines page: when it's due, what to do, the part only she
// can do, and where the rule comes from.

const TONE = { overdue: "failed", red: "failed", yellow: "pending", green: "done" } as const;

export function formatDate(iso: string, withWeekday = true): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: withWeekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}

function whenLabel(o: ObligationView): string {
  if (o.days_left === null) return "";
  if (o.days_left < 0) return `${-o.days_left} ${-o.days_left === 1 ? "day" : "days"} overdue`;
  if (o.days_left === 0) return "Due today";
  if (o.days_left === 1) return "Tomorrow";
  return `${o.days_left} days`;
}

export function UrgencyPill({ o }: { o: ObligationView }) {
  if (!o.urgency) return null;
  const tone = TONE[o.urgency];
  return (
    <span
      className="inline-flex h-7 shrink-0 items-center rounded-full px-3 text-small font-semibold"
      style={{ color: `var(--status-${tone}-fg)`, background: `var(--status-${tone}-bg)` }}
    >
      {whenLabel(o)}
    </span>
  );
}

export function SourceLine({ o }: { o: ObligationView }) {
  if (!o.citation) return null;
  return (
    <p className="text-small text-[var(--fg-muted)]">
      {o.source_url ? "Source" : "Why"}:{" "}
      {o.source_url ? (
        <a href={o.source_url} target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
          {o.citation}
        </a>
      ) : (
        o.citation
      )}
      {o.last_verified_on && <> · checked {formatDate(o.last_verified_on, false)}</>}
    </p>
  );
}

export function ResearchedBadge({ o }: { o: ObligationView }) {
  if (o.verified_by !== "agent") return null;
  return (
    <p
      className="rounded-[14px] px-3 py-2 text-small font-medium"
      style={{ color: "var(--status-pending-fg)", background: "var(--status-pending-bg)" }}
    >
      Aeon researched this. Please confirm it with your board.
    </p>
  );
}

function CeProgress({ ce }: { ce: NonNullable<ObligationView["ce"]> }) {
  const pct = Math.min(100, Math.round((ce.done / ce.required) * 100));
  const required = ce.topics_left.filter((t) => !t.optional);
  const optional = ce.topics_left.filter((t) => t.optional);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-small">
        <span className="font-semibold">
          {ce.done} of {ce.required} hours
        </span>
        <span className="text-[var(--fg-muted)]">{Math.max(0, ce.required - ce.done)} to go</span>
      </div>
      <div
        role="progressbar"
        aria-label="CE hours done"
        aria-valuemin={0}
        aria-valuemax={ce.required}
        aria-valuenow={ce.done}
        className="h-2.5 overflow-hidden rounded-full bg-[var(--hairline)]"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      {required.length > 0 && (
        <p className="text-small">
          <span className="font-semibold">Still needed: </span>
          {required.map((t) => `${t.label} (${t.hours} hr)`).join(", ")}
        </p>
      )}
      {optional.length > 0 && (
        <p className="text-small text-[var(--fg-muted)]">
          Optional: {optional.map((t) => t.label).join(", ")}. {optional[0].optional}
        </p>
      )}
    </div>
  );
}

export function DeadlineCard({ o }: { o: ObligationView }) {
  const headingId = `obligation-${o.id}`;
  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="font-semibold leading-snug">
            {o.title}
          </h3>
          {o.due_on && (
            <p className="text-small text-[var(--fg-muted)]">
              {o.category === "license_window" ? "Opens" : "Due"} {formatDate(o.due_on)}
            </p>
          )}
        </div>
        <UrgencyPill o={o} />
      </div>

      {o.what_to_do && <p className="max-w-[65ch]">{o.what_to_do}</p>}
      {o.you_must && (
        <p className="max-w-[65ch] text-small">
          <span className="font-semibold">You do this: </span>
          {o.you_must}
        </p>
      )}
      {o.ce && <CeProgress ce={o.ce} />}
      {o.caveat && <p className="max-w-[65ch] text-small text-[var(--fg-muted)]">Note: {o.caveat}</p>}
      <ResearchedBadge o={o} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {o.guide_slug && (
          <Link
            href={`/how-do-i/${o.guide_slug}`}
            className="inline-flex h-touch items-center font-semibold text-[var(--link)] underline underline-offset-2"
          >
            How do I do this?
          </Link>
        )}
        <SourceLine o={o} />
      </div>
    </li>
  );
}
