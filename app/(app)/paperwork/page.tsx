import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatDate } from "@/components/deadline-card";
import { GfeTimingCheck } from "@/components/gfe-timing-check";
import { Chip, GlassCard } from "@/components/ui";
import { danaFacts } from "@/lib/compliance/demo";
import { loadSavedRules } from "@/lib/compliance/researched";
import { SHIPPED_RULES } from "@/lib/compliance/rules";
import { STATES } from "@/lib/compliance/states";
import { loadFacts, practiceToday } from "@/lib/compliance/store";
import { CAQH_URL, caqhPrep } from "@/lib/credentialing/checklist";
import { DANA_PROFILE } from "@/lib/credentialing/demo";
import { grandTotal, lineTotal, money } from "@/lib/gfe/build";
import { DANA_OPEN_DAYS, SAMPLE_BOOKING, sampleGfe, sampleGfeDue } from "@/lib/gfe/demo";
import { DIAGNOSIS_NOT_YET } from "@/lib/gfe/types";

export const metadata: Metadata = { title: "Paperwork · Practice-OS" };

const TABS = [
  { id: "gfe", label: "Good Faith Estimates" },
  { id: "credentialing", label: "Credentialing" },
] as const;

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PaperworkPage({ searchParams }: PageProps<"/paperwork">) {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Paperwork</h1>
        <p className="max-w-[65ch] text-[var(--fg-muted)]">
          Aeon prepares the forms. You send, sign and attest: Aeon never does those for you.
        </p>
      </header>
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-[24px] bg-[var(--glass-strong)]" />}>
        <Tabs searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Tabs({ searchParams }: { searchParams: PageProps<"/paperwork">["searchParams"] }) {
  const tab = (await searchParams).tab === "credentialing" ? "credentialing" : "gfe";
  return (
    <>
      <nav aria-label="Paperwork sections" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "gfe" ? "/paperwork" : `/paperwork?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`inline-flex h-touch items-center rounded-full px-5 text-body font-medium transition-colors duration-150 ${
              tab === t.id
                ? "bg-[var(--primary-bg)] text-[var(--primary-fg)]"
                : "border border-border bg-[var(--chip-off-bg)] text-[var(--fg)] hover:border-accent"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "gfe" ? <GoodFaithEstimates /> : <Credentialing />}
    </>
  );
}

function GoodFaithEstimates() {
  const g = sampleGfe();
  const due = sampleGfeDue();
  const hours = DANA_OPEN_DAYS.weekdays.map((d) => WEEKDAY[d]).join(", ");
  return (
    <>
      <GlassCard aria-labelledby="gfe-heading" className="flex flex-col gap-5 p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="gfe-heading" className="text-section font-semibold">
            {g.patient.firstName} {g.patient.lastName}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Chip>Self-pay</Chip>
            <Chip>[Sample] fictional demo practice</Chip>
          </div>
        </div>
        <p className="max-w-[65ch]">{g.primaryService.description}</p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
            <dt className="text-small text-[var(--fg-muted)]">Booked</dt>
            <dd className="font-semibold">{formatDate(SAMPLE_BOOKING.scheduledOn)}</dd>
          </div>
          <div className="rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
            <dt className="text-small text-[var(--fg-muted)]">First visit</dt>
            <dd className="font-semibold">{formatDate(SAMPLE_BOOKING.serviceOn)}</dd>
            <dd className="text-small text-[var(--fg-muted)]">{due.leadDays} open days out</dd>
          </div>
          <div className="rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
            <dt className="text-small text-[var(--fg-muted)]">Give the estimate by</dt>
            <dd className="font-semibold">{due.dueOn ? formatDate(due.dueOn) : "No deadline at booking"}</dd>
            <dd className="text-small text-[var(--fg-muted)]">{due.rule}</dd>
          </div>
        </dl>
        <div role="region" aria-label="Itemized estimate" tabIndex={0} className="overflow-x-auto rounded-[12px] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
          <table className="w-full min-w-[520px] text-left text-body">
            <caption className="sr-only">Itemized estimate</caption>
            <thead className="text-small text-[var(--fg-muted)]">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-semibold">Service</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Code</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Qty</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Each</th>
                <th scope="col" className="py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {g.estimates[0].lines.map((l) => (
                <tr key={l.serviceCode.number} className="border-b border-[var(--hairline)]">
                  <td className="py-2 pr-3">{l.service}</td>
                  <td className="py-2 pr-3">
                    {l.serviceCode.type} {l.serviceCode.number}
                  </td>
                  <td className="py-2 pr-3 text-right">{l.quantity}</td>
                  <td className="py-2 pr-3 text-right">{money(l.unitCharge)}</td>
                  <td className="py-2 text-right">{money(lineTotal(l))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4} className="py-2 pr-3 font-semibold">
                  Total for 12 months
                </th>
                <td className="py-2 text-right font-semibold">{money(grandTotal(g))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-small text-[var(--fg-muted)]">
          Diagnosis: {DIAGNOSIS_NOT_YET}. Valid for 12 months from the estimate date; after that Aeon drafts a new one.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/gfe/sample"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-btn-primary items-center rounded-full bg-[var(--primary-bg)] px-7 font-semibold text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]"
          >
            Open the PDF
          </a>
          <p className="text-small text-[var(--fg-muted)]">You send it to the client. Aeon doesn’t send anything.</p>
        </div>
      </GlassCard>

      <GlassCard aria-labelledby="timing-heading" className="flex flex-col gap-4 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="timing-heading" className="text-section font-semibold">
            When is an estimate due?
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            Counted in days your practice is open: {hours}, closed on federal holidays [Sample]. Booked 3 or more open days ahead: 1
            open day. 10 or more: 3 open days. If the client asks: 3 open days.
          </p>
        </div>
        <GfeTimingCheck open={DANA_OPEN_DAYS} initial={{ bookedOn: "2026-11-25", visitOn: "2026-12-15" }} />
        <p className="text-small text-[var(--fg-muted)]">
          Source:{" "}
          <a
            href="https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-G/section-149.610"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--link)] underline underline-offset-2"
          >
            45 CFR 149.610
          </a>
          . Aeon tracks paperwork; it isn’t legal advice.
        </p>
      </GlassCard>
    </>
  );
}

async function Credentialing() {
  await connection(); // read the database per request, never at build time
  const today = await practiceToday();
  const facts = (await loadFacts()) ?? danaFacts(today);
  const rules = [...SHIPPED_RULES, ...(await loadSavedRules())];
  const p = DANA_PROFILE;
  const prep = caqhPrep(p, facts, rules, today);
  const state = STATES[facts.practice_state] ?? facts.practice_state;

  const sections: { title: string; lines: string[]; flag?: string }[] = [
    { title: "Identity", lines: [`${p.identity.name}, ${p.identity.credential}`, p.identity.practiceName, `${p.identity.phone} · ${p.identity.email}`] },
    { title: "Education", lines: p.education.map((e) => `${e.degree}, ${e.school}, ${e.graduated}`) },
    {
      title: "License",
      lines: [
        `${p.license.type}, ${state}`,
        p.license.board,
        prep.licenseExpiresOn ? `Expires ${formatDate(prep.licenseExpiresOn, false)}` : "Expiration not known yet",
        "License number: [Sample] not shown. Practice-OS doesn’t store it.",
      ],
    },
    { title: "NPI", lines: [`Type ${p.npi.type}: ${p.npi.number} [Sample]`, `Taxonomy ${p.npi.taxonomy} (${p.npi.taxonomyLabel})`, "Not a real NPI: NPPES has no one with this number."] },
    {
      title: "Malpractice",
      lines: [`${p.malpractice.carrier}`, `$${p.malpractice.perClaim / 1e6}M per claim / $${p.malpractice.aggregate / 1e6}M aggregate`],
      flag: `Expires ${formatDate(p.malpractice.expiresOn, false)}`,
    },
    {
      title: "Practice location",
      lines: [
        p.practiceLocation.name,
        `${p.practiceLocation.address.street}, ${p.practiceLocation.address.city}, ${p.practiceLocation.address.state} ${p.practiceLocation.address.zip} [Sample]`,
        p.practiceLocation.telehealth ? "Also sees clients by telehealth" : "In person only",
      ],
    },
    {
      title: "Work history",
      lines: p.workHistory.map((w) => `${w.role}, ${w.employer}: ${w.from.slice(0, 7)} to ${w.to ? w.to.slice(0, 7) : "now"}`),
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <GlassCard aria-labelledby="profile-heading" className="flex flex-col gap-4 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="profile-heading" className="text-section font-semibold">
            Credentialing profile
          </h2>
          <p className="text-[var(--fg-muted)]">
            {p.identity.name}, {p.identity.credential} (fictional demo practice). In CAQH ProView’s order, so you can copy it section by section.
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {sections.map((s) => (
            <li key={s.title} className="rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{s.title}</h3>
                {s.flag && (
                  <span
                    className="inline-flex h-7 items-center rounded-full px-3 text-small font-semibold"
                    style={{ color: "var(--status-pending-fg)", background: "var(--status-pending-bg)" }}
                  >
                    {s.flag}
                  </span>
                )}
              </div>
              {s.lines.map((l) => (
                <p key={l} className="text-[var(--fg-muted)]">
                  {l}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard aria-labelledby="caqh-heading" className="flex h-fit flex-col gap-4 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="caqh-heading" className="text-section font-semibold">
            CAQH prep
          </h2>
          <p>
            {prep.attestBy ? (
              <>
                Re-attest by <strong>{formatDate(prep.attestBy)}</strong>
                {prep.cycleDays && <> ({state}: every {prep.cycleDays} days)</>}.
              </>
            ) : (
              "Aeon needs your last attestation date first."
            )}
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {prep.items.map((i) => (
            <li key={i.id} className="flex gap-3 rounded-[16px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-small font-bold"
                style={
                  i.done
                    ? { color: "var(--status-done-fg)", background: "var(--status-done-bg)" }
                    : { color: "var(--status-pending-fg)", background: "var(--status-pending-bg)" }
                }
              >
                {i.done ? "✓" : "!"}
              </span>
              <div className="flex flex-col">
                <p className="font-medium">
                  <span className="sr-only">{i.done ? "Done: " : "To do: "}</span>
                  {i.label}
                  {i.you && !i.done && <span className="text-small text-[var(--fg-muted)]"> · You do this</span>}
                </p>
                {i.detail && <p className="text-small text-[var(--fg-muted)]">{i.detail}</p>}
                {i.id === "caqh_date" && (
                  <Link href="/deadlines" className="text-small text-[var(--link)] underline underline-offset-2">
                    Add it on Deadlines
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-body font-semibold">{prep.finalStep}</p>
          <a href={CAQH_URL} target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
            Open CAQH ProView
          </a>
          <p className="text-small text-[var(--fg-muted)]">Aeon never attests or submits for you.</p>
        </div>
      </GlassCard>
    </div>
  );
}
