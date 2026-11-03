"use client";

// Referrals › Calendar: the coffees, calls, meetings and lunch talks she plans with
// people on her board (lib/referrals/meetings.ts, /api/referrals/meetings). A toolbar
// (back, forward, the range, Today, Day / Week / Month, + Plan a meeting) over the view:
// - Week (the default): Mon to Fri, plus Sat and Sun when something falls on them,
//   8am to 6pm in her practice time zone, a now-line on today. On a phone, a list by day.
// - Day: the same grid, one column. Month: whole weeks with small labels and "+N more".
// A meeting opens its details on the right; "+ Plan a meeting" opens the form. Nothing
// here sends anything: a meeting is on her calendar only.
// partnerId (Partners' "Plan a meeting"): the form opens with that partner picked.

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { IconButton, IconButtonGroup } from "@/components/shared/icon-button";
import { Tab, TabList, TabPanel, Tabs } from "@/components/shared/tabs";
import { Button } from "@/components/ui";
import { Agenda } from "../calendar/agenda";
import { fetchMeetings, fetchPartners, type CalendarPartner, type Meeting } from "../calendar/api";
import { dayKey, rangeLabel, stepAnchor, viewDays, viewRange, visibleWeekDays, type CalendarView } from "../calendar/layout";
import { MeetingSheet } from "../calendar/meeting-sheet";
import { MonthGrid } from "../calendar/month-grid";

import { PlanSheet, type PlanStart } from "../calendar/plan-sheet";
import { TimeGrid } from "../calendar/time-grid";

const VIEWS: { id: CalendarView; label: string; unit: string }[] = [
  { id: "day", label: "Day", unit: "day" },
  { id: "week", label: "Week", unit: "week" },
  { id: "month", label: "Month", unit: "month" },
];

export function CalendarTab({ partnerId }: { /** Picked from a partner's "Plan a meeting"; optional. */ partnerId?: string | null } = {}) {
  const [setup, setSetup] = useState<{ partners: CalendarPartner[]; timeZone: string } | null>(null);
  const [setupError, setSetupError] = useState("");
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanStart | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [handledPartner, setHandledPartner] = useState<string | null>(null);

  // Her board and time zone (GET /api/referrals/meetings/partners), read once.
  useEffect(() => {
    let live = true;
    fetchPartners()
      .then((s) => {
        if (!live) return;
        setSetup(s);
        setAnchor(dayKey(new Date(), s.timeZone));
      })
      .catch(() => live && setSetupError("Couldn't load your calendar. Reload the page to try again."));
    return () => {
      live = false;
    };
  }, []);

  // The now-line moves every minute.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const timeZone = setup?.timeZone ?? "America/Chicago";
  const today = dayKey(now, timeZone);
  const range = useMemo(() => (anchor ? viewRange(view, anchor, timeZone) : null), [view, anchor, timeZone]);

  // Bumped after every change: the effect below reads the range again (and drops any older answer).
  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);

  useEffect(() => {
    let live = true;
    if (!range) return;
    fetchMeetings(range)
      .then((m) => {
        if (!live) return;
        setMeetings(m);
        setLoadError("");
      })
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : "Couldn't load your calendar. Try again."));
    return () => {
      live = false;
    };
  }, [range, tick]);

  // Partners' "Plan a meeting": open the form with that partner, once per pick.
  if (setup && partnerId && partnerId !== handledPartner) {
    setHandledPartner(partnerId);
    setPlan({ partnerId, day: null });
  }

  const byId = useMemo(() => new Map((setup?.partners ?? []).map((p) => [p.id, p])), [setup]);
  const open = openId ? (meetings ?? []).find((m) => m.id === openId) ?? null : null;
  const unit = VIEWS.find((v) => v.id === view)!.unit;

  if (setupError) {
    return (
      <p role="alert" className="rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-5 text-small text-[var(--danger-fg)]">
        {setupError}
      </p>
    );
  }
  if (!setup || !anchor || !range) {
    return <div aria-hidden className="h-96 animate-pulse rounded-[var(--radius-card-sm)] bg-[var(--hairline)]" />;
  }

  const days = viewDays(view, anchor);
  const shown = meetings ?? [];
  const isEmpty = meetings !== null && shown.length === 0;
  const empty = (
    <div className="rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
      <EmptyState
        icon={<CalendarDays size={20} />}
        title={`No meetings this ${unit}.`}
        action={
          <Button variant="quiet" onClick={() => setPlan({ partnerId: null, day: view === "day" ? anchor : null })}>
            <Plus aria-hidden size={16} />
            Plan a meeting
          </Button>
        }
      >
        Ask Aeon to find a time, or plan one.
      </EmptyState>
    </div>
  );

  function body(v: CalendarView) {
    if (meetings === null) return <div aria-hidden className="h-96 animate-pulse rounded-[var(--radius-card-sm)] bg-[var(--hairline)]" />;
    if (v === "month") {
      return (
        <MonthGrid
          days={days}
          month={anchor!.slice(0, 7)}
          meetings={shown}
          timeZone={timeZone}
          today={today}
          onOpen={setOpenId}
          onDay={(d) => {
            setView("day");
            setAnchor(d);
          }}
        />
      );
    }
    if (isEmpty) return empty;
    if (v === "day") return <TimeGrid days={days} meetings={shown} timeZone={timeZone} today={today} now={now} onOpen={setOpenId} />;
    const cols = visibleWeekDays(days, shown, timeZone);
    return (
      <>
        <div className="hidden md:block">
          <TimeGrid days={cols} meetings={shown} timeZone={timeZone} today={today} now={now} onOpen={setOpenId} />
        </div>
        <div className="md:hidden">
          <Agenda days={days} meetings={shown} timeZone={timeZone} today={today} onOpen={setOpenId} />
        </div>
      </>
    );
  }

  return (
    <section aria-label="Referrals calendar" className="flex flex-col gap-4">
      <Tabs value={view} onValueChange={setView} className="gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <IconButtonGroup>
            <div className="flex items-center">
              <IconButton label={`Previous ${unit}`} icon={<ChevronLeft size={16} />} onClick={() => setAnchor(stepAnchor(view, anchor, -1))} />
              <IconButton label={`Next ${unit}`} icon={<ChevronRight size={16} />} onClick={() => setAnchor(stepAnchor(view, anchor, 1))} />
            </div>
          </IconButtonGroup>
          <h2 aria-live="polite" className="min-w-0 flex-1 text-section font-semibold tabular-nums" data-testid="calendar-range">
            {rangeLabel(view, anchor)}
          </h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button variant="quiet" onClick={() => setAnchor(today)}>
              Today
            </Button>
            <TabList label="Calendar view" look="segmented" className="w-auto min-w-[13rem] flex-1 sm:flex-none">
              {VIEWS.map((v) => (
                <Tab key={v.id} value={v.id} look="segmented">
                  {v.label}
                </Tab>
              ))}
            </TabList>
            <Button variant="accent" onClick={() => setPlan({ partnerId: null, day: view === "day" ? anchor : null })}>
              <Plus aria-hidden size={16} />
              Plan a meeting
            </Button>
          </div>
        </div>

        {loadError && (
          <p role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] bg-[var(--danger-bg)] px-4 py-3 text-small font-medium text-[var(--danger-fg)]">
            {loadError}
            <button type="button" onClick={load} className="min-h-touch underline underline-offset-2">
              Try again
            </button>
          </p>
        )}

        {VIEWS.map((v) => (
          <TabPanel key={v.id} value={v.id}>
            {body(v.id)}
          </TabPanel>
        ))}
      </Tabs>

      <p className="text-small text-[var(--fg-muted)]">Times are in your practice&apos;s time zone ({timeZone.replace(/_/g, " ")}). Meetings are on your calendar only; nothing is sent.</p>

      <MeetingSheet
        meeting={open}
        partner={open ? byId.get(open.source_id) ?? null : null}
        timeZone={timeZone}
        today={today}
        onClose={() => setOpenId(null)}
        onChanged={(m) => {
          if (m.status === "canceled") setOpenId(null);
          load();
        }}
      />
      <PlanSheet
        start={plan}
        partners={setup.partners}
        timeZone={timeZone}
        today={today}
        onClose={() => setPlan(null)}
        onPlanned={(m) => {
          setPlan(null);
          // Show the week (or day, or month) that holds the new meeting.
          setAnchor(dayKey(m.starts_at, timeZone));
          load();
        }}
      />
    </section>
  );
}
