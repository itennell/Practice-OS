import { connection } from "next/server";
import { Suspense } from "react";
import { FrontDeskRules } from "@/components/approval-settings";
import { PhoneCard } from "@/components/connections/phone-card";
import { AlertList } from "@/components/front-desk/alert-list";
import { CalendarCard } from "@/components/front-desk/calendar-card";
import { CheckNow } from "@/components/front-desk/check-now";
import { InboxList } from "@/components/front-desk/inbox";
import { TestConsole } from "@/components/front-desk/test-console";
import { ChipLink, GlassCard } from "@/components/ui";
import { loadApprovalSettings } from "@/lib/approval-settings";
import { isDryRun } from "@/lib/env";
import { calendarStatus, phoneStatus } from "@/lib/frontdesk/connect";
import { alertPhone } from "@/lib/frontdesk/crisis";
import { prettyPhone } from "@/lib/frontdesk/phone/numbers";
import { defaultGreeting, loadFrontDeskSetup } from "@/lib/frontdesk/setup";
import { frontDeskInbox, INBOX_FILTERS, maskPhone, lastCheck, type InboxFilter } from "@/lib/frontdesk/inbox";
import { frontDeskView } from "@/lib/frontdesk/view";

export const metadata = { title: "Front Desk · Practice-OS" };

const FILTER_LABEL: Record<InboxFilter, string> = { all: "All", needs_you: "Needs you", calls: "Calls", voicemails: "Voicemails", texts: "Texts", web_chat: "Website chat", bookings: "Bookings" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const who = (s: string) => (s.startsWith("+") ? maskPhone(s) : s);

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
  const filter: InboxFilter = (INBOX_FILTERS as readonly string[]).includes(String(q)) ? (q as InboxFilter) : "all";
  const [view, inbox, last, phone, calendar, settings, setup, greeting, ownPhone] = await Promise.all([
    frontDeskView(),
    frontDeskInbox(filter),
    lastCheck(),
    phoneStatus(),
    calendarStatus(),
    loadApprovalSettings(),
    loadFrontDeskSetup(),
    defaultGreeting(),
    alertPhone(),
  ]);
  const texting = !phone.connected
    ? { ok: false, note: "connect your phone below first." }
    : phone.note
      ? { ok: false, note: phone.note }
      : { ok: true, note: "working now." };
  const calcom = calendar.provider === "calcom" && calendar.connected;
  return (
    <>
      <GlassCard aria-labelledby="needs-you" className="flex flex-col gap-4 p-6 md:p-8">
        <h2 id="needs-you" className="text-section">
          Needs you
        </h2>
        <AlertList initial={view.alerts} />
      </GlassCard>

      <TestConsole
        line={phone.connected && phone.number ? prettyPhone(phone.number) : null}
        texting={texting}
        alertPhone={ownPhone ? `ending ${ownPhone.slice(-4)}` : null}
        dryRun={isDryRun()}
        open={filter === "all" && inbox.every((i) => i.isSample)}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <GlassCard aria-labelledby="inbox" className="flex min-w-0 flex-col gap-4 p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="inbox" className="text-section">
                Inbox
              </h2>
              <p className="max-w-[60ch] text-small text-[var(--fg-muted)]">Every call, voicemail, text and booking on your practice line, newest first. Numbers show the last four digits until you ask.</p>
            </div>
            <CheckNow last={last} />
          </div>
          <nav aria-label="Filter the inbox" className="flex flex-wrap gap-2">
            {INBOX_FILTERS.map((f) => (
              <ChipLink key={f} href={f === "all" ? "/front-desk" : `/front-desk?filter=${f}`} on={f === filter}>
                {FILTER_LABEL[f]}
              </ChipLink>
            ))}
          </nav>
          <InboxList items={inbox} />
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PhoneCard initial={{ connected: phone.connected, label: phone.check?.ok ? phone.check.label : undefined, fix: phone.check && !phone.check.ok ? phone.check.fix : undefined, devLine: phone.devLine, vendor: phone.vendor, texting: phone.texting, voicemailOn: phone.voicemailOn, number: phone.number, note: phone.note }} />
        <CalendarCard
          initial={{
            calcom: { connected: calcom, label: calcom && calendar.check?.ok ? calendar.check.label : undefined, fix: calcom && calendar.check && !calendar.check.ok ? calendar.check.fix : undefined },
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
