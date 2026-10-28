import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DeadlineCard, ResearchedBadge, SourceLine, formatDate } from "@/components/deadline-card";
import { SetupReminders } from "@/components/setup-reminders";
import { Chip, GlassCard } from "@/components/ui";
import { deadlinesView } from "@/lib/compliance/view";
import { listPayerApplications, payerDates } from "@/lib/payers/store";
import Link from "next/link";

export const metadata: Metadata = { title: "Deadlines · Practice-OS" };

const FACT_QUESTION: Record<string, string> = {
  caqh_last_attested_on: "When did you last attest on CAQH?",
  pllc_formed_on: "When was your PLLC formed?",
  medicare_revalidation_due_on: "What revalidation date does data.cms.gov show for you?",
  medicare_opt_out_ends_on: "When does your Medicare opt-out period end?",
  impact_revalidation_due_on: "What revalidation date does IMPACT show for you?",
  apit_granted_on: "When was your PSYPACT APIT granted?",
};

export default function DeadlinesPage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Deadlines</h1>
        <p className="max-w-[65ch] text-[var(--fg-muted)]">
          Everything due in the next 90 days, plus anything that needs a head start, most urgent first. Aeon prepares; the parts marked “You do this” are yours.
        </p>
      </header>
      <Suspense fallback={<ListSkeleton />}>
        <Deadlines />
      </Suspense>
    </>
  );
}

async function Deadlines() {
  await connection(); // read the database per request, never at build time
  const view = await deadlinesView(90);
  const insurance = payerDates(await listPayerApplications(), view.today, 90);
  const count = (u: string) => view.due.filter((d) => d.urgency === u).length;
  const urgent = count("overdue") + count("red");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Chip on>{urgent} urgent</Chip>
        <Chip>{count("yellow")} coming up</Chip>
        <Chip>{count("green")} later</Chip>
        <Chip>Today: {formatDate(view.today, false)}</Chip>
        {view.is_sample && <Chip>[Sample] fictional demo practice</Chip>}
      </div>

      <GlassCard aria-labelledby="due-heading" className="flex flex-col gap-5 p-6 md:p-8">
        <h2 id="due-heading" className="text-section font-semibold">
          Coming up
        </h2>
        {view.due.length === 0 ? (
          <p className="text-[var(--fg-muted)]">Nothing due in the next {view.days} days.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.due.map((o) => (
              <DeadlineCard key={o.id} o={o} />
            ))}
          </ul>
        )}
      </GlassCard>

      {insurance.length > 0 && (
        <GlassCard aria-labelledby="insurance-heading" className="flex flex-col gap-3 p-6 md:p-8">
          <h2 id="insurance-heading" className="text-section font-semibold">
            Insurance follow-ups
          </h2>
          <ul className="flex flex-col gap-2">
            {insurance.map((d) => (
              <li key={`${d.id}-${d.kind}`}>
                <span className="font-semibold">
                  {d.days_left < 0 ? `${-d.days_left} days overdue` : d.days_left === 0 ? "Today" : formatDate(d.due_on)}:
                </span>{" "}
                {d.what}
              </li>
            ))}
          </ul>
          <Link href="/admin?panel=insurance" className="text-small text-[var(--link)] underline underline-offset-2">
            Your insurance applications
          </Link>
        </GlassCard>
      )}

      {view.needs_facts.length > 0 && (
        <GlassCard aria-labelledby="facts-heading" className="flex flex-col gap-3 p-6 md:p-8">
          <h2 id="facts-heading" className="text-section font-semibold">
            Aeon needs a date
          </h2>
          <p className="text-[var(--fg-muted)]">These deadlines can’t be shown until you tell Aeon one date.</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {view.needs_facts.map((n) => (
              <li key={n.rule_id}>
                <span className="font-semibold">{n.title}:</span> {FACT_QUESTION[n.fact] ?? n.fact}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      <GlassCard aria-labelledby="setup-heading" className="flex flex-col gap-4 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="setup-heading" className="text-section font-semibold">
            Did you set this up?
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            Things every practice owner needs. Aeon remembers your answer and asks again when it’s time.
          </p>
        </div>
        <SetupReminders initial={view.setups} doneCount={view.setups_done} />
      </GlassCard>

      {view.notes.length > 0 && (
        <GlassCard aria-labelledby="notes-heading" className="flex flex-col gap-4 p-6 md:p-8">
          <h2 id="notes-heading" className="text-section font-semibold">
            Good to know
          </h2>
          <ul className="flex flex-col gap-2">
            {view.notes.map((n) => (
              <li key={n.id}>
                <details className="group rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] px-5">
                  <summary className="flex min-h-touch cursor-pointer items-center py-3 font-semibold">{n.title}</summary>
                  <div className="flex flex-col gap-2 pb-4">
                    {n.what_to_do && <p className="max-w-[65ch]">{n.what_to_do}</p>}
                    {n.caveat && <p className="text-small text-[var(--fg-muted)]">Note: {n.caveat}</p>}
                    <SourceLine o={n} />
                    <ResearchedBadge o={n} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <p className="max-w-[65ch] text-small text-[var(--fg-muted)]">
            Aeon tracks deadlines and paperwork. It doesn’t give legal, tax or clinical advice; check anything important
            with your board, your accountant or an attorney.
          </p>
        </GlassCard>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {["w-36", "w-36", "w-24", "w-40"].map((w, i) => (
          <div key={i} className={`h-chip ${w} animate-pulse rounded-full bg-[var(--hairline)]`} />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-[20px] bg-[var(--hairline)]" />
      ))}
    </div>
  );
}
