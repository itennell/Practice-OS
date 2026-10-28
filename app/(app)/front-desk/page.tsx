import { connection } from "next/server";
import { Suspense } from "react";
import { FrontDeskRules } from "@/components/approval-settings";
import { PhoneCard } from "@/components/connections/phone-card";
import { AlertList } from "@/components/front-desk/alert-list";
import { CalendarCard } from "@/components/front-desk/calendar-card";
import { CheckNow } from "@/components/front-desk/check-now";
import { StatusPill, type Status } from "@/components/shared/status-mark";
import { ChipLink, GlassCard } from "@/components/ui";
import { loadApprovalSettings } from "@/lib/approval-settings";
import { calendarStatus, phoneStatus } from "@/lib/frontdesk/connect";
import { prettyPhone } from "@/lib/frontdesk/phone/numbers";
import { defaultGreeting, loadFrontDeskSetup } from "@/lib/frontdesk/setup";
import { FILTERS, frontDeskView, type Filter, type InquiryView } from "@/lib/frontdesk/view";

export const metadata = { title: "Front Desk · Practice-OS" };

const FILTER_LABEL: Record<Filter, string> = { all: "All", needs_you: "Needs you", waiting: "Waiting on caller", booked: "Booked" };
const STATUS: Record<InquiryView["status"], { status: Status; label: string }> = {
  new: { status: "pending", label: "New" },
  options_sent: { status: "running", label: "Options sent" },
  booked: { status: "done", label: "Booked" },
  needs_clinician: { status: "pending", label: "Needs you" },
  closed: { status: "declined", label: "Closed" },
};
const CHANNEL: Record<InquiryView["channel"], string> = { voicemail: "Voicemail", sms: "Text", web_chat: "Web chat" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const who = (s: string) => (s.startsWith("+1") ? prettyPhone(s) : s);

export default function FrontDeskPage({ searchParams }: PageProps<"/front-desk">) {
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span aria-hidden className="orb-front-desk inline-block size-12 shrink-0" />
          <div className="flex flex-col gap-1">
            <h1 className="text-title">Front Desk</h1>
            <p className="max-w-[65ch] text-[var(--fg-muted)]">
              Missed calls and texts to your practice line, the consult times callers were offered, and what&apos;s booked. Logistics only.
            </p>
          </div>
        </div>
        <CheckNow />
      </header>
      <Suspense fallback={<p className="text-[var(--fg-muted)]">Loading Front Desk…</p>}>
        <FrontDesk searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function FrontDesk({ searchParams }: { searchParams: PageProps<"/front-desk">["searchParams"] }) {
  await connection(); // read the database per request, never at build time
  const q = (await searchParams).filter;
  const filter: Filter = (FILTERS as readonly string[]).includes(String(q)) ? (q as Filter) : "all";
  const [view, phone, calendar, settings, setup, greeting] = await Promise.all([
    frontDeskView(filter),
    phoneStatus(),
    calendarStatus(),
    loadApprovalSettings(),
    loadFrontDeskSetup(),
    defaultGreeting(),
  ]);
  const calcom = calendar.provider === "calcom" && calendar.connected;
  return (
    <>
      <GlassCard aria-labelledby="needs-you" className="flex flex-col gap-4 p-6 md:p-8">
        <h2 id="needs-you" className="text-section">
          Needs you
        </h2>
        <AlertList initial={view.alerts} />
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <GlassCard aria-labelledby="callers" className="flex min-w-0 flex-col gap-4 p-6 md:p-8">
          <h2 id="callers" className="text-section">
            Calls and texts
          </h2>
          <nav aria-label="Filter calls and texts" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <ChipLink key={f} href={f === "all" ? "/front-desk" : `/front-desk?filter=${f}`} on={f === filter}>
                {FILTER_LABEL[f]}
              </ChipLink>
            ))}
          </nav>
          {view.inquiries.length === 0 ? (
            <p className="text-[var(--fg-muted)]">No calls or texts here yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--hairline)]">
              {view.inquiries.map((i) => (
                <li key={i.id} className="flex min-h-14 flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {who(i.who)}
                      {i.crisis && <span className="ml-2 text-small font-semibold text-[var(--danger-fg)]">Urgent</span>}
                    </span>
                    <span className="truncate text-small text-[var(--fg-muted)]">
                      {CHANNEL[i.channel]} · {i.summary ?? i.lastMessage ?? ""}
                    </span>
                  </div>
                  <span className="text-small text-[var(--fg-muted)] sm:w-40">{i.consultAt ? `Consult ${when(i.consultAt)}` : when(i.updatedAt)}</span>
                  <StatusPill status={STATUS[i.status].status}>{STATUS[i.status].label}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard aria-labelledby="up-next" className="flex flex-col gap-4 p-6">
          <h2 id="up-next" className="text-section">
            Up next
          </h2>
          {view.consults.length === 0 ? (
            <p className="text-[var(--fg-muted)]">No consults booked yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {view.consults.map((c) => (
                <li key={c.id} className="flex flex-col">
                  <span className="font-medium">{when(c.startsAt)}</span>
                  <span className="text-small text-[var(--fg-muted)]">
                    {who(c.who)}
                    {c.reference ? ` · ${c.reference}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PhoneCard initial={{ connected: phone.connected, label: phone.check?.ok ? phone.check.label : undefined, fix: phone.check && !phone.check.ok ? phone.check.fix : undefined, devLine: phone.devLine }} />
        <CalendarCard
          initial={{
            provider: calendar.provider,
            calcom: { connected: calcom, label: calcom && calendar.check?.ok ? calendar.check.label : undefined, fix: calcom && calendar.check && !calendar.check.ok ? calendar.check.fix : undefined },
            google: {
              connected: calendar.provider === "google" && calendar.connected,
              label: calendar.check?.ok ? calendar.check.label : undefined,
              fix: calendar.check && !calendar.check.ok ? calendar.check.fix : undefined,
            },
          }}
        />
      </div>

      <GlassCard aria-labelledby="fd-greeting" className="flex flex-col gap-3 p-6 md:p-8">
        <h2 id="fd-greeting" className="text-section">
          Your voicemail greeting
        </h2>
        <p className="max-w-[65ch] text-[var(--fg-muted)]">
          Record this as the voicemail greeting in your phone app. Callers who leave a message get one text with your open times.
        </p>
        <blockquote className="max-w-[65ch] rounded-[16px] border border-border bg-[var(--chip-off-bg)] p-4">{setup.greeting ?? greeting}</blockquote>
      </GlassCard>

      <GlassCard aria-labelledby="fd-rules" className="flex flex-col gap-2 p-6 md:p-8">
        <h2 id="fd-rules" className="text-section">
          What Front Desk does on its own
        </h2>
        <p className="max-w-[65ch] text-[var(--fg-muted)]">
          These switches don&apos;t depend on the chat mode. Every text uses fixed wording, says it&apos;s from an AI assistant the first time, and is written to the log.
        </p>
        <FrontDeskRules initial={settings.frontDesk} />
      </GlassCard>
    </>
  );
}
