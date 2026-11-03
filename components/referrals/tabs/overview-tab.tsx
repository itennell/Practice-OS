"use client";

// Referrals › Overview: where her referrals come from (counts and dates only, never who
// the client was), how each one was counted, this week's follow-ups, letters and
// meetings, the latest activity, and a small card that opens the Map tab.

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, HandHeart, LayoutDashboard, Mail, Map as MapIcon, MessageSquareText, NotebookPen, Sparkles, UserRound } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterMenu } from "@/components/shared/filter-menu";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { Button } from "@/components/ui";
import {
  countedBy,
  dayIn,
  latestActivity,
  letterCounts,
  meetingRange,
  referralSourceBars,
  SOURCE_GROUP_OPTIONS,
  SOURCE_WINDOW_OPTIONS,
  type ApprovalBits,
  type MeetingBits,
  type SourceGroup,
  type SourceWindow,
} from "@/lib/referrals/crm-views";
import { dayLabel } from "@/lib/referrals/partners";
import { cn } from "@/lib/utils";
import { CARD, getJson, getMeetings, type CrmTabProps } from "./tab-props";

type Overview = {
  follow_ups: { id: string; name: string; on: string; days_left: number }[];
  reach_out: { id: string; name: string; next_step: string }[];
  going_cold: { id: string; name: string; label: string }[];
  approvals: ApprovalBits[];
};

const LINK = "rounded-[6px] text-small font-medium text-[var(--link)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";

export function OverviewTab({ data, onOpenPartner, onTab }: CrmTabProps = {}) {
  const [days, setDays] = useState<SourceWindow>("90");
  const [by, setBy] = useState<SourceGroup>("partner");
  const [overview, setOverview] = useState<Overview | null>(null);
  // null: still asking; false: the meetings calendar isn't there yet (404) or didn't answer.
  const [meetings, setMeetings] = useState<MeetingBits[] | false | null>(null);
  const today = data?.today ?? "";

  useEffect(() => {
    if (!today) return;
    const ctl = new AbortController();
    getJson<Overview>("/api/referrals/overview", ctl.signal).then((o) => !ctl.signal.aborted && setOverview(o ?? { follow_ups: [], reach_out: [], going_cold: [], approvals: [] }));
    const { from, to } = meetingRange(today, 0, 7);
    getMeetings<MeetingBits>(from, to, ctl.signal).then((m) => !ctl.signal.aborted && setMeetings(m ? m.filter((x) => x.status !== "canceled") : false));
    return () => ctl.abort();
  }, [today]);

  const cards = useMemo(() => data?.cards ?? [], [data]);
  const sources = useMemo(
    () => (data ? referralSourceBars(cards, data.contacts, data.tiers, { days: Number(days), by, today }) : { bars: [], total: 0 }),
    [cards, data, days, by, today],
  );
  const counted = useMemo(() => (data ? countedBy(data.contacts, Number(days), today) : { clinician: 0, aeon: 0 }), [data, days, today]);
  const letters = useMemo(() => (data ? letterCounts(data.letters, cards) : { waiting: 0, ready: 0 }), [data, cards]);
  const activity = useMemo(() => (data ? latestActivity(cards, data.contacts, overview?.approvals ?? [], data.timeZone) : []), [cards, data, overview]);

  if (!data) {
    return (
      <div className={CARD}>
        <EmptyState icon={<LayoutDashboard size={20} />} title="Overview">
          How your referral network is doing, at a glance.
        </EmptyState>
      </div>
    );
  }

  const max = Math.max(1, ...sources.bars.map((b) => b.count));
  const windowWords = SOURCE_WINDOW_OPTIONS.find((o) => o.value === days)!.label.toLowerCase();
  const open = (id: string) => onOpenPartner?.(id);
  const nameButton = (id: string, name: string) => (
    <button type="button" onClick={() => open(id)} aria-label={`Open ${name}`} className="max-w-full text-left break-words hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid">
      {name}
    </button>
  );
  const near = cards.filter((c) => !c.sensitive && c.distance_miles !== null && c.stage !== "not_a_fit").map((c) => c.distance_miles!);

  return (
    <div className="flex flex-col gap-4" data-testid="overview-tab">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="ov-sources" className={cn(CARD, "flex min-w-0 flex-col gap-3 p-4")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 id="ov-sources" className="font-semibold">
                Where referrals come from
              </h2>
              <p className="text-small text-[var(--fg-muted)]">
                {sources.total} {sources.total === 1 ? "referral" : "referrals"} in the {windowWords}. Dates and counts only, never who.
              </p>
            </div>
            <div role="group" aria-label="Chart filters" className="flex flex-wrap gap-2">
              <FilterMenu label="Range" options={SOURCE_WINDOW_OPTIONS} value={days} onChange={setDays} align="end" />
              <FilterMenu label="Group" options={SOURCE_GROUP_OPTIONS} value={by} onChange={setBy} align="end" />
            </div>
          </div>
          {sources.bars.length === 0 ? (
            <EmptyState icon={<HandHeart size={20} />} title="No referrals logged yet" className="py-6">
              When a partner sends someone your way, log it on their card (More › Log a referral). It shows here as a bar.
            </EmptyState>
          ) : (
            <ol aria-label={`Referrals ${by === "partner" ? "by partner" : "by kind"}`} className="flex flex-col gap-2.5">
              {sources.bars.slice(0, 8).map((b) => (
                <li key={b.key} className="grid grid-cols-[minmax(0,15rem)_1fr_auto] items-center gap-3 text-small max-sm:grid-cols-[1fr_auto]" title={`${b.label}: ${b.count}, last on ${dayLabel(b.last, today)}`}>
                  <span className="min-w-0 truncate font-medium max-sm:col-span-2">{by === "partner" ? nameButton(b.key, b.label) : b.label}</span>
                  <span aria-hidden className="h-3 rounded-r-[4px] bg-[var(--hairline)]">
                    <span className="block h-full rounded-r-[4px] bg-[var(--accent-fg)]" style={{ width: `${Math.max(4, (b.count / max) * 100)}%` }} />
                  </span>
                  <span className="text-right whitespace-nowrap tabular-nums">
                    <span className="font-semibold">{b.count}</span>
                    <span className="sr-only"> {b.count === 1 ? "referral" : "referrals"}, last on {dayLabel(b.last, today)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <ListCard id="ov-counted" label="How each referral was counted">
          <ListRow icon={<UserRound size={16} />} title="You logged it" detail={`On the partner's card, in the ${windowWords}`} end={<span className="font-semibold tabular-nums">{counted.clinician}</span>} />
          {counted.aeon > 0 && <ListRow icon={<Sparkles size={16} />} title="Aeon logged it for you" detail="From the chat, when you told Aeon" end={<span className="font-semibold tabular-nums">{counted.aeon}</span>} />}
          <ListRow icon={<ClipboardList size={16} />} title="New client's intake answer" detail="Coming soon: add “How did you hear about us?” to your intake form" end={<span className="text-small text-[var(--fg-muted)]">Soon</span>} />
        </ListCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ListCard id="ov-week" label="This week">
          {overview === null ? (
            <li className="border-t border-[var(--line)] px-4 py-3 text-small text-[var(--fg-muted)]">Loading this week…</li>
          ) : (
            <>
              {overview.follow_ups.map((f) => (
                <ListRow
                  key={`f-${f.id}`}
                  accent={f.days_left <= 0}
                  icon={<CalendarDays size={16} />}
                  title={nameButton(f.id, f.name)}
                  detail={f.days_left < 0 ? `Follow-up ${-f.days_left} days overdue` : f.days_left === 0 ? "Follow up today" : `Follow up ${dayLabel(f.on, today)}`}
                  wrapEnd
                />
              ))}
              {overview.going_cold.map((g) => (
                <ListRow key={`g-${g.id}`} icon={<MessageSquareText size={16} />} title={nameButton(g.id, g.name)} detail={g.label} wrapEnd />
              ))}
              <ListRow
                icon={<Mail size={16} />}
                title={letters.ready ? `${letters.ready} ${letters.ready === 1 ? "letter is" : "letters are"} ready to send` : "No letters ready to send"}
                detail={letters.waiting ? `${letters.waiting} more waiting for your approval. Aeon never sends: you copy and send it yourself.` : "Approved letters wait here until you send them from your own email."}
                end={letters.waiting ? <a href="/approvals" className={LINK}>Approvals</a> : undefined}
                wrapEnd
              />
              <ListRow
                icon={<CalendarDays size={16} />}
                title={meetings === null ? "Meetings this week" : meetings === false || meetings.length === 0 ? "No meetings this week" : `${meetings.length} ${meetings.length === 1 ? "meeting" : "meetings"} this week`}
                detail={
                  meetings === null
                    ? "Loading…"
                    : meetings === false || meetings.length === 0
                      ? "Plan a coffee or a call with a partner in the Calendar tab."
                      : meetings
                          .slice(0, 3)
                          .map((m) => `${m.source_name} (${dayLabel(dayIn(data.timeZone, m.starts_at), today)})`)
                          .join(", ")
                }
                end={
                  <button type="button" onClick={() => onTab?.("calendar")} className={LINK}>
                    Calendar
                  </button>
                }
                wrapEnd
              />
              {overview.reach_out.length > 0 && (
                <ListRow
                  icon={<UserRound size={16} />}
                  title={`${overview.reach_out.length} new ${overview.reach_out.length === 1 ? "person" : "people"} to reach out to`}
                  detail={overview.reach_out.map((r) => r.name).join(", ")}
                  wrapEnd
                />
              )}
            </>
          )}
        </ListCard>

        <section aria-labelledby="ov-map" className={cn(CARD, "flex flex-col gap-3 p-4")}>
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--line)] text-[var(--fg-muted)]">
              <MapIcon size={16} />
            </span>
            <div className="min-w-0">
              <h2 id="ov-map" className="font-semibold">
                Your partners on a map
              </h2>
              <p className="text-small text-[var(--fg-muted)]">
                {near.length ? `${near.length} ${near.length === 1 ? "partner" : "partners"} within ${Math.ceil(Math.max(...near))} mi of your office.` : "Add partners to see them around your office."} Places that ask for privacy never get a pin.
              </p>
            </div>
          </div>
          <MiniMap cards={near} />
          <Button variant="quiet" onClick={() => onTab?.("map")} className="mt-auto h-touch self-start px-4">
            Open the map
          </Button>
        </section>
      </div>

      <ListCard id="ov-activity" label="Latest activity">
        {activity.length === 0 ? (
          <li className="border-t border-[var(--line)] px-4 py-3 text-small text-[var(--fg-muted)]">Nothing yet. Calls, letters, meetings and referrals you log show here.</li>
        ) : (
          activity.map((a) => (
            <ListRow
              key={`${a.kind}-${a.id}`}
              icon={a.kind === "approval" ? <Mail size={16} /> : <NotebookPen size={16} />}
              title={a.sourceId ? nameButton(a.sourceId, a.title) : a.title}
              detail={a.detail}
              end={<span className="text-small whitespace-nowrap text-[var(--fg-muted)]">{dayLabel(a.day, today)}</span>}
              wrapEnd
            />
          ))
        )}
      </ListCard>
    </div>
  );
}

/** A quiet picture of how far partners are: dots on rings at 1, 3, 5 and 10 miles. Decorative; the Map tab has the real map. */
function MiniMap({ cards }: { cards: number[] }) {
  const rings = [1, 3, 5, 10];
  const r = (mi: number) => 8 + Math.sqrt(Math.min(mi, 10) / 10) * 52;
  return (
    <svg aria-hidden viewBox="0 0 140 140" className="mx-auto h-36 w-36">
      {rings.map((mi) => (
        <circle key={mi} cx="70" cy="70" r={r(mi)} fill="none" stroke="var(--line)" strokeWidth="1" />
      ))}
      <circle cx="70" cy="70" r="4" fill="var(--fg)" />
      {cards.slice(0, 40).map((mi, i) => {
        const a = i * 2.4;
        return <circle key={i} cx={70 + r(mi) * Math.cos(a)} cy={70 + r(mi) * Math.sin(a)} r="3.5" fill="var(--accent-fg)" stroke="var(--glass)" strokeWidth="1.5" />;
      })}
    </svg>
  );
}
