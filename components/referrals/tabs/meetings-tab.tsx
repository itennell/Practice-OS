"use client";

// Referrals › Meetings and notes: one timeline, newest day first, of her contact log
// (meetings, calls, letters, referrals, notes, debriefs) and the meetings on her
// referrals calendar (when that calendar is there). Filters by type and by partner.
// "Record a debrief" picks a partner, then opens the coffee debrief on their panel.
// A referral row is a date only: nothing about the client is ever kept or shown.

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, HandHeart, Mail, Mic, NotebookPen, Phone, Search, Users } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterMenu } from "@/components/shared/filter-menu";
import { TextField } from "@/components/shared/settings-controls";
import { SideSheet } from "@/components/shared/side-sheet";
import { Button } from "@/components/ui";
import {
  dayHeading,
  filterTimeline,
  groupByDay,
  meetingRange,
  TIMELINE_FILTER_OPTIONS,
  timelineItems,
  type MeetingBits,
  type TimelineFilter,
  type TimelineKind,
} from "@/lib/referrals/crm-views";
import { cn } from "@/lib/utils";
import { CARD, getMeetings, type CrmTabProps } from "./tab-props";

const ICON: Record<TimelineKind, typeof Phone> = { meeting: CalendarDays, call: Phone, letter: Mail, referral: HandHeart, note: NotebookPen };
const SHOW_DAYS = 30;

export function MeetingsTab({ data, onOpenPartner }: CrmTabProps = {}) {
  const [kind, setKind] = useState<TimelineFilter>("all");
  const [partner, setPartner] = useState("all");
  const [meetings, setMeetings] = useState<MeetingBits[]>([]);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(SHOW_DAYS);
  const today = data?.today ?? "";

  useEffect(() => {
    if (!today) return;
    const ctl = new AbortController();
    // The calendar's API allows 62 days at most: the last 55 and the week ahead. No calendar yet (404): the log alone.
    const { from, to } = meetingRange(today, 54, 7);
    getMeetings<MeetingBits>(from, to, ctl.signal).then((m) => !ctl.signal.aborted && setMeetings(m ?? []));
    return () => ctl.abort();
  }, [today]);

  const cards = useMemo(() => data?.cards ?? [], [data]);
  const items = useMemo(() => (data ? timelineItems(cards, data.contacts, meetings, { timeZone: data.timeZone }) : []), [cards, data, meetings]);
  const groups = useMemo(() => groupByDay(filterTimeline(items, kind, partner)), [items, kind, partner]);
  const partnerOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const i of items) count.set(i.sourceId, (count.get(i.sourceId) ?? 0) + 1);
    return [
      { value: "all", label: "All partners" },
      ...cards.filter((c) => count.has(c.id)).map((c) => ({ value: c.id, label: c.name, count: count.get(c.id) })).sort((a, b) => a.label.replace(/^\[Sample\]\s*/, "").localeCompare(b.label.replace(/^\[Sample\]\s*/, ""))),
    ];
  }, [items, cards]);
  const debriefable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => c.stage !== "not_a_fit" && !c.suggested_from && (!q || [c.name, c.organization].filter(Boolean).join(" ").toLowerCase().includes(q)));
  }, [cards, query]);

  if (!data) {
    return (
      <div className={CARD}>
        <EmptyState icon={<NotebookPen size={20} />} title="Meetings and notes">
          Your debriefs and notes from each meeting, in one place.
        </EmptyState>
      </div>
    );
  }

  const shown = groups.slice(0, days);

  return (
    <div className="flex flex-col gap-4" data-testid="meetings-tab">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Timeline filters" className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <FilterMenu label="Show" options={TIMELINE_FILTER_OPTIONS} value={kind} allValue="all" onChange={setKind} />
          <FilterMenu label="Partner" options={partnerOptions} value={partner} allValue="all" onChange={setPartner} />
        </div>
        <Button variant="accent" onClick={() => setPicking(true)}>
          <Mic aria-hidden size={16} />
          Record a debrief
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className={CARD}>
          <EmptyState icon={<NotebookPen size={20} />} title={items.length ? "Nothing matches" : "No meetings or notes yet"}>
            {items.length
              ? "Try another type or partner."
              : "After a coffee or a call, record a debrief or log it on the partner's card. It shows here by day."}
          </EmptyState>
        </div>
      ) : (
        <ol aria-label="Meetings and notes by day" className="flex flex-col gap-4">
          {shown.map((g) => (
            <li key={g.day} className="flex flex-col gap-2">
              <h2 className="px-1 text-small font-semibold text-[var(--fg-muted)]">
                <time dateTime={g.day}>{dayHeading(g.day, today)}</time>
              </h2>
              <ul className={cn(CARD, "flex flex-col overflow-hidden")}>
                {g.items.map((i, n) => {
                  const Icon = ICON[i.kind];
                  return (
                    <li key={i.id} className={cn("flex items-start gap-3 px-4 py-3", n > 0 && "border-t border-[var(--line)]")}>
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px]",
                          i.planned || i.debrief ? "bg-[var(--status-running-bg)] text-[var(--accent-fg)]" : "border border-[var(--line)] text-[var(--fg-muted)]",
                        )}
                      >
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.875rem] font-semibold">
                          <button
                            type="button"
                            onClick={() => onOpenPartner?.(i.sourceId)}
                            aria-label={`Open ${i.name}`}
                            className="text-left break-words hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
                          >
                            {i.name}
                          </button>
                        </p>
                        <p className="text-small font-medium">{i.label}</p>
                        {i.note && <p className="text-small whitespace-pre-line text-[var(--fg-muted)]">{i.note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {groups.length > days && (
        <Button variant="quiet" onClick={() => setDays((d) => d + SHOW_DAYS)} className="self-start">
          Show older days
        </Button>
      )}

      <SideSheet open={picking} onOpenChange={setPicking} title="Record a debrief" description="Who did you meet with? Pick them, then record up to 3 minutes about the meeting. You check everything before it's saved.">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search aria-hidden size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--fg-muted)]" />
            <TextField compact hideLabel label="Search partners" type="search" placeholder="Search name or practice" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
          </div>
          {debriefable.length === 0 ? (
            <EmptyState icon={<Users size={20} />} title="Nobody matches">
              Try a shorter search. Partners in Not a fit aren&rsquo;t listed.
            </EmptyState>
          ) : (
            <ul aria-label="Pick a partner" className={cn(CARD, "flex flex-col overflow-hidden")}>
              {debriefable.map((c, n) => (
                <li key={c.id} className={cn(n > 0 && "border-t border-[var(--line)]")}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(false);
                      onOpenPartner?.(c.id, true);
                    }}
                    aria-label={`Debrief ${c.name}`}
                    className="flex min-h-[56px] w-full flex-col justify-center px-4 py-2 text-left outline-none hover:bg-[var(--hairline)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
                  >
                    <span className="text-[0.875rem] font-semibold break-words">{c.name}</span>
                    {c.organization && c.organization !== c.name && <span className="text-small text-[var(--fg-muted)]">{c.organization}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SideSheet>
    </div>
  );
}
